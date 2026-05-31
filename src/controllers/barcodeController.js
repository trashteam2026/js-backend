import axios from 'axios';

import {
  createItemWithGeneratedBarcode,
  getBarcodeMapping,
  getItemByBarcode,
} from '../repositories/barcodeRepository.js';

const OPEN_FOOD_FACTS_BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';
const OPEN_FOOD_FACTS_USER_AGENT =
  process.env.OPEN_FOOD_FACTS_USER_AGENT || 'disc-food-pantry/1.0';
const UPCITEMDB_API_KEY = process.env.UPCITEMDB_API_KEY;
const UPCITEMDB_BASE_URL = 'https://api.upcitemdb.com/prod/trial/lookup';

const lookupOpenFoodFacts = async (barcode) => {
  const response = await axios.get(
    `${OPEN_FOOD_FACTS_BASE_URL}/${encodeURIComponent(barcode)}`,
    {
      params: {
        fields: 'product_name,product_name_en,generic_name,generic_name_en',
      },
      headers: {
        'User-Agent': OPEN_FOOD_FACTS_USER_AGENT,
      },
    }
  );

  const product = response.data?.product;
  const productName =
    product?.product_name ||
    product?.product_name_en ||
    product?.generic_name ||
    product?.generic_name_en ||
    null;

  if (!productName) {
    return null;
  }

  return {
    productName,
    source: 'open_food_facts',
  };
};

const lookupUpcItemDb = async (barcode) => {
  const headers = UPCITEMDB_API_KEY
    ? { user_key: UPCITEMDB_API_KEY }
    : undefined;

  const response = await axios.get(UPCITEMDB_BASE_URL, {
    params: { upc: barcode },
    headers,
  });

  const firstItem = response.data?.items?.[0];
  if (!firstItem?.title) {
    return null;
  }

  return {
    productName: firstItem.title,
    source: 'upcitemdb',
  };
};

const lookupProvider = async (providerName, lookupFn, barcode) => {
  try {
    return await lookupFn(barcode);
  } catch (error) {
    if (error.response?.status === 429) {
      console.warn(`${providerName} barcode lookup rate limit hit`);
      return null;
    }

    if (error.response?.status === 404) {
      return null;
    }

    console.warn(`${providerName} barcode lookup failed:`, error.message);
    return null;
  }
};

const calculateUpcACheckDigit = (elevenDigits) => {
  const sum = elevenDigits
    .split('')
    .reduce((total, digit, index) => {
      const value = Number.parseInt(digit, 10);
      return total + value * (index % 2 === 0 ? 3 : 1);
    }, 0);

  return String((10 - (sum % 10)) % 10);
};

const generateLocalUseUpcA = () => {
  let body = '4';
  while (body.length < 11) {
    body += Math.floor(Math.random() * 10);
  }

  return `${body}${calculateUpcACheckDigit(body)}`;
};

const isBarcodeKnownExternally = async (barcode) => {
  const openFoodFactsResult = await lookupProvider(
    'Open Food Facts',
    lookupOpenFoodFacts,
    barcode
  );
  if (openFoodFactsResult) {
    return true;
  }

  const upcItemDbResult = await lookupProvider(
    'UPCItemDB',
    lookupUpcItemDb,
    barcode
  );
  return Boolean(upcItemDbResult);
};

export const lookupBarcode = async (req, res) => {
  const { barcode } = req.body;

  if (!barcode) {
    return res.status(400).json({ error: 'Barcode is required' });
  }

  try {
    // Check our own database first - existing items in inventory take priority
    const existingItem = await getItemByBarcode(barcode);
    if (existingItem) {
      return res.json({
        categoryId: existingItem.category_id,
        categoryName: existingItem.category_name,
        productName: existingItem.name,
        source: 'database',
      });
    }

    // The admin nickname wins over any third-party catalog result. That keeps
    // the pantry's preferred naming consistent across future scans.
    const customMapping = await getBarcodeMapping(barcode);
    if (customMapping) {
      return res.json({
        productName: customMapping.custom_name,
        source: 'custom',
      });
    }

    const openFoodFactsResult = await lookupProvider(
      'Open Food Facts',
      lookupOpenFoodFacts,
      barcode
    );
    if (openFoodFactsResult) {
      return res.json(openFoodFactsResult);
    }

    // Free fallback for products that Open Food Facts does not know about yet.
    // UPCItemDB allows no-key Explorer usage, and accepts user_key when present.
    const upcItemDbResult = await lookupProvider(
      'UPCItemDB',
      lookupUpcItemDb,
      barcode
    );
    if (upcItemDbResult) {
      return res.json(upcItemDbResult);
    }

    return res.status(404).json({ error: 'Product not found' });
  } catch (error) {
    console.error('Error looking up barcode:', error);
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (error.response?.status === 429) {
      return res.status(503).json({ error: 'Barcode provider rate limit hit' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const generateBarcode = async (req, res) => {
  const name = req.body.name?.trim();
  const categoryId = Number.parseInt(req.body.categoryId, 10);

  if (!name || !Number.isInteger(categoryId) || categoryId <= 0) {
    return res
      .status(400)
      .json({ error: 'name and categoryId are required' });
  }

  try {
    const maxAttempts = 25;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const barcode = generateLocalUseUpcA();
      const [existingItem, customMapping] = await Promise.all([
        getItemByBarcode(barcode),
        getBarcodeMapping(barcode),
      ]);

      if (existingItem || customMapping) {
        continue;
      }

      const knownExternally = await isBarcodeKnownExternally(barcode);
      if (knownExternally) {
        continue;
      }

      try {
        const item = await createItemWithGeneratedBarcode({
          barcode,
          name,
          categoryId,
        });

        return res.status(201).json({
          message: 'Barcode generated successfully',
          item,
          barcode,
        });
      } catch (error) {
        if (error.code === '23505') {
          continue;
        }
        if (error.code === 'CATEGORY_NOT_FOUND') {
          return res.status(400).json({ error: 'categoryId does not exist' });
        }
        throw error;
      }
    }

    return res.status(409).json({
      error: 'Could not generate an unused barcode. Please try again.',
    });
  } catch (error) {
    console.error('Error generating barcode:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
