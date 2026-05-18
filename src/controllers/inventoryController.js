import {
  checkInInventoryItem,
  checkOutInventoryItem,
  createCategory,
  getCategoriesWithItems,
  getItemDetailById,
} from '../repositories/inventoryRepository.js';

const parsePositiveInteger = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const inventoryController = {
  async listCategories(req, res) {
    try {
      const { parentGroup } = req.query;
      const categories = await getCategoriesWithItems(parentGroup);
      res.json(categories);
    } catch (error) {
      console.error('List inventory categories error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async createCategory(req, res) {
    try {
      const { name, parentGroup, displayOrder } = req.body;

      if (!name || !parentGroup) {
        return res
          .status(400)
          .json({ error: 'name and parentGroup are required' });
      }

      if (!['food', 'non_food'].includes(parentGroup)) {
        return res
          .status(400)
          .json({ error: 'parentGroup must be food or non_food' });
      }

      const normalizedDisplayOrder = parsePositiveInteger(displayOrder, 1);
      if (normalizedDisplayOrder === null) {
        return res
          .status(400)
          .json({ error: 'displayOrder must be a positive integer' });
      }

      const category = await createCategory({
        name: name.trim(),
        parentGroup,
        displayOrder: normalizedDisplayOrder,
      });

      res.status(201).json(category);
    } catch (error) {
      console.error('Create inventory category error:', error);
      if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Category name already exists' });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getItemDetail(req, res) {
    try {
      const itemId = Number.parseInt(req.params.itemId, 10);

      if (!Number.isInteger(itemId)) {
        return res.status(400).json({ error: 'itemId must be an integer' });
      }

      const item = await getItemDetailById(itemId);
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      res.json(item);
    } catch (error) {
      console.error('Get inventory item detail error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async checkIn(req, res) {
    try {
      const {
        barcode,
        name,
        expirationDate,
        quantity,
        categoryId,
        lowStockThreshold,
      } = req.body;

      if (!name || !expirationDate) {
        return res
          .status(400)
          .json({ error: 'name and expirationDate are required' });
      }

      const normalizedQuantity = parsePositiveInteger(quantity, 1);
      if (normalizedQuantity === null) {
        return res
          .status(400)
          .json({ error: 'quantity must be a positive integer' });
      }

      const normalizedCategoryId =
        categoryId === undefined || categoryId === null || categoryId === ''
          ? null
          : parsePositiveInteger(categoryId, null);
      if (categoryId !== undefined && normalizedCategoryId === null) {
        return res
          .status(400)
          .json({ error: 'categoryId must be a positive integer' });
      }

      const normalizedLowStockThreshold = parsePositiveInteger(
        lowStockThreshold,
        10
      );
      if (normalizedLowStockThreshold === null) {
        return res
          .status(400)
          .json({ error: 'lowStockThreshold must be a positive integer' });
      }

      const parsedExpirationDate = new Date(expirationDate);
      if (Number.isNaN(parsedExpirationDate.getTime())) {
        return res
          .status(400)
          .json({ error: 'expirationDate must be a valid date' });
      }

      // We store the batch date in YYYY-MM-DD format so multiple check-ins for
      // the same day collapse into one batch row instead of drifting apart due
      // to timezone offsets in ISO timestamps.
      const normalizedExpirationDate = parsedExpirationDate
        .toISOString()
        .slice(0, 10);

      const result = await checkInInventoryItem({
        barcode,
        name: name.trim(),
        expirationDate: normalizedExpirationDate,
        quantity: normalizedQuantity,
        categoryId: normalizedCategoryId,
        lowStockThreshold: normalizedLowStockThreshold,
      });

      const itemDetail = await getItemDetailById(result.item.id);

      res.status(201).json({
        message: 'Inventory item checked in successfully',
        item: itemDetail,
        batch: result.batch,
      });
    } catch (error) {
      console.error('Inventory check-in error:', error);
      if (error.code === '23503') {
        return res.status(400).json({ error: 'categoryId does not exist' });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async checkOut(req, res) {
    try {
      const { barcode, itemId, quantity } = req.body;

      const normalizedQuantity = parsePositiveInteger(quantity, null);
      if (normalizedQuantity === null) {
        return res
          .status(400)
          .json({ error: 'quantity must be a positive integer' });
      }

      const hasBarcode =
        typeof barcode === 'string' && barcode.trim().length > 0;
      const normalizedItemId =
        itemId === undefined || itemId === null || itemId === ''
          ? null
          : parsePositiveInteger(itemId, null);
      if (itemId !== undefined && itemId !== null && itemId !== '' && normalizedItemId === null) {
        return res
          .status(400)
          .json({ error: 'itemId must be a positive integer' });
      }

      if (!hasBarcode && normalizedItemId === null) {
        return res
          .status(400)
          .json({ error: 'barcode or itemId is required' });
      }

      let result;
      try {
        result = await checkOutInventoryItem({
          barcode: hasBarcode ? barcode.trim() : null,
          itemId: normalizedItemId,
          quantity: normalizedQuantity,
        });
      } catch (error) {
        if (error.code === 'BARCODE_NOT_FOUND') {
          return res.status(404).json({
            error: 'No item is registered for this barcode',
            code: 'BARCODE_NOT_FOUND',
            barcode: error.barcode,
          });
        }
        if (error.code === 'ITEM_NOT_FOUND') {
          return res
            .status(404)
            .json({ error: 'Item not found', code: 'ITEM_NOT_FOUND' });
        }
        if (error.code === 'INSUFFICIENT_STOCK') {
          return res.status(409).json({
            error: 'Insufficient stock for the requested quantity',
            code: 'INSUFFICIENT_STOCK',
            requested: error.requested,
            available: error.available,
          });
        }
        throw error;
      }

      const itemDetail = await getItemDetailById(result.item.id);

      res.status(200).json({
        message: 'Inventory item checked out successfully',
        item: itemDetail,
        removed: result.removed,
        batchesAffected: result.batchesAffected,
      });
    } catch (error) {
      console.error('Inventory check-out error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

export default inventoryController;
