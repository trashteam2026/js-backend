import axios from 'axios';

import {
  getBarcodeMapping,
  setBarcodeMapping,
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

export const lookupBarcode = async (req, res) => {
  const { barcode } = req.body;

  if (!barcode) {
    return res.status(400).json({ error: 'Barcode is required' });
  }

  try {
    // The admin nickname wins over any third-party catalog result. That keeps
    // the pantry's preferred naming consistent across future scans.
    const customMapping = await getBarcodeMapping(barcode);
    if (customMapping) {
      return res.json({
        productName: customMapping.custom_name,
        source: 'custom',
      });
    }

    const openFoodFactsResult = await lookupOpenFoodFacts(barcode);
    if (openFoodFactsResult) {
      return res.json(openFoodFactsResult);
    }

    // Optional paid fallback for products that Open Food Facts does not know
    // about yet. Leaving this behind an env var keeps the default setup free.
    if (UPCITEMDB_API_KEY) {
      const upcItemDbResult = await lookupUpcItemDb(barcode);
      if (upcItemDbResult) {
        return res.json(upcItemDbResult);
      }
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

export const setCustomName = async (req, res) => {
  const { barcode, customName } = req.body;

  if (!barcode || !customName) {
    return res
      .status(400)
      .json({ error: 'Barcode and customName are required' });
  }

  try {
    const mapping = await setBarcodeMapping(barcode, customName);
    res.json({ message: 'Custom name set', mapping });
  } catch (error) {
    console.error('Error setting custom name:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
