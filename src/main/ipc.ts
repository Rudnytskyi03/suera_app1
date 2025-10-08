import { ipcMain } from 'electron';
import bcrypt from 'bcryptjs';
import { getDatabase, MaterialRecord, OrderRecord, ProductRecord } from '../../db/database';

export function registerIpcHandlers() {
  const db = getDatabase();
  ipcMain.handle('auth:login', (_event, email: string, password: string) => {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const user = stmt.get(email) as { id: number; email: string; password: string } | undefined;

    if (!user) {
      throw new Error('Неверный email или пароль');
    }

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) {
      throw new Error('Неверный email или пароль');
    }

    return { id: user.id, email: user.email };
  });

  ipcMain.handle('materials:list', () => {
    const stmt = db.prepare('SELECT * FROM materials ORDER BY name');
    const materials = stmt.all() as MaterialRecord[];
    return materials.map((material) => ({
      id: material.id,
      name: material.name,
      category: material.category,
      unit: material.unit,
      quantity: material.quantity,
      pricePerUnit: material.price_per_unit,
      photo: material.photo ?? undefined
    }));
  });

  ipcMain.handle('materials:create', (_event, payload) => {
    const insert = db.prepare(
      'INSERT INTO materials (name, category, unit, quantity, price_per_unit, photo) VALUES (@name, @category, @unit, @quantity, @pricePerUnit, @photo)'
    );
    const result = insert.run(payload);
    const created = db.prepare('SELECT * FROM materials WHERE id = ?').get(result.lastInsertRowid) as MaterialRecord;
    return {
      id: created.id,
      name: created.name,
      category: created.category,
      unit: created.unit,
      quantity: created.quantity,
      pricePerUnit: created.price_per_unit,
      photo: created.photo ?? undefined
    };
  });

  ipcMain.handle('materials:update', (_event, id: number, payload) => {
    const update = db.prepare(
      'UPDATE materials SET name=@name, category=@category, unit=@unit, quantity=@quantity, price_per_unit=@pricePerUnit, photo=@photo WHERE id=@id'
    );
    update.run({ ...payload, id });
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(id) as MaterialRecord;
    return {
      id: material.id,
      name: material.name,
      category: material.category,
      unit: material.unit,
      quantity: material.quantity,
      pricePerUnit: material.price_per_unit,
      photo: material.photo ?? undefined
    };
  });

  ipcMain.handle('materials:delete', (_event, id: number) => {
    const del = db.prepare('DELETE FROM materials WHERE id = ?');
    del.run(id);
    return { success: true };
  });

  ipcMain.handle('products:list', () => {
    const products = db.prepare('SELECT * FROM products ORDER BY name').all() as ProductRecord[];
    const materialsStmt = db.prepare(
      'SELECT pm.*, m.name as material_name, m.unit as material_unit, m.price_per_unit as material_price FROM product_materials pm JOIN materials m ON pm.material_id = m.id WHERE pm.product_id = ?'
    );
    const photosStmt = db.prepare('SELECT url FROM product_photos WHERE product_id = ?');

    return products.map((product) => {
      const materials = materialsStmt.all(product.id).map((row: any) => ({
        id: row.material_id,
        name: row.material_name,
        unit: row.material_unit,
        pricePerUnit: row.material_price,
        quantity: row.quantity
      }));
      const photos = photosStmt.all(product.id).map((row: any) => row.url);
      return {
        id: product.id,
        name: product.name,
        description: product.description ?? '',
        costPrice: product.cost_price,
        sewingCost: product.sewing_cost,
        packagingCost: product.packaging_cost,
        shippingCost: product.shipping_cost,
        advertisingCost: product.advertising_cost,
        salePrice: product.sale_price,
        profit: product.profit,
        materials,
        photos
      };
    });
  });

  ipcMain.handle('products:save', (_event, payload) => {
    const {
      id,
      name,
      description,
      materials,
      sewingCost,
      packagingCost,
      shippingCost,
      advertisingCost,
      salePrice,
      photos
    } = payload;

    const costPrice = materials.reduce(
      (acc: number, item: any) => acc + item.pricePerUnit * item.quantity,
      0
    );
    const totalCost = costPrice + sewingCost + packagingCost + shippingCost + advertisingCost;
    const profit = salePrice - totalCost;

    if (id) {
      const update = db.prepare(
        `UPDATE products SET name=@name, description=@description, cost_price=@costPrice, sewing_cost=@sewingCost,
         packaging_cost=@packagingCost, shipping_cost=@shippingCost, advertising_cost=@advertisingCost,
         sale_price=@salePrice, profit=@profit WHERE id=@id`
      );
      update.run({
        id,
        name,
        description,
        costPrice,
        sewingCost,
        packagingCost,
        shippingCost,
        advertisingCost,
        salePrice,
        profit
      });
      db.prepare('DELETE FROM product_materials WHERE product_id = ?').run(id);
      db.prepare('DELETE FROM product_photos WHERE product_id = ?').run(id);

      const insertMaterial = db.prepare(
        'INSERT INTO product_materials (product_id, material_id, quantity) VALUES (?, ?, ?)'
      );
      const insertPhoto = db.prepare('INSERT INTO product_photos (product_id, url) VALUES (?, ?)');
      const insertMaterialTxn = db.transaction((items: any[]) => {
        for (const item of items) {
          insertMaterial.run(id, item.id, item.quantity);
        }
      });
      insertMaterialTxn(materials);
      const insertPhotoTxn = db.transaction((urls: string[]) => {
        for (const url of urls) {
          insertPhoto.run(id, url);
        }
      });
      insertPhotoTxn(photos);

      return { id, costPrice, profit };
    } else {
      const insert = db.prepare(
        `INSERT INTO products (name, description, cost_price, sewing_cost, packaging_cost, shipping_cost, advertising_cost, sale_price, profit)
         VALUES (@name, @description, @costPrice, @sewingCost, @packagingCost, @shippingCost, @advertisingCost, @salePrice, @profit)`
      );
      const result = insert.run({
        name,
        description,
        costPrice,
        sewingCost,
        packagingCost,
        shippingCost,
        advertisingCost,
        salePrice,
        profit
      });
      const productId = Number(result.lastInsertRowid);
      const insertMaterial = db.prepare(
        'INSERT INTO product_materials (product_id, material_id, quantity) VALUES (?, ?, ?)'
      );
      const insertPhoto = db.prepare('INSERT INTO product_photos (product_id, url) VALUES (?, ?)');
      const materialTxn = db.transaction((items: any[]) => {
        for (const item of items) {
          insertMaterial.run(productId, item.id, item.quantity);
        }
      });
      materialTxn(materials);
      const photoTxn = db.transaction((urls: string[]) => {
        for (const url of urls) {
          insertPhoto.run(productId, url);
        }
      });
      photoTxn(photos);
      return { id: productId, costPrice, profit };
    }
  });

  ipcMain.handle('products:delete', (_event, id: number) => {
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('orders:list', () => {
    const orders = db.prepare('SELECT * FROM orders ORDER BY datetime(created_at) DESC').all() as OrderRecord[];
    const itemsStmt = db.prepare(
      'SELECT oi.*, p.name as product_name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE order_id = ?'
    );

    return orders.map((order) => ({
      ...order,
      items: itemsStmt.all(order.id).map((row: any) => ({
        id: row.product_id,
        name: row.product_name,
        quantity: row.quantity,
        price: row.price,
        discount: row.discount
      }))
    }));
  });

  ipcMain.handle('orders:save', (_event, payload) => {
    const { id, orderNumber, customerFirstName, customerLastName, customerInstagram, deliveryAddress, items, status } = payload;
    const totalAmount = items.reduce(
      (acc: number, item: any) => acc + (item.price - item.discount) * item.quantity,
      0
    );

    if (id) {
      db.prepare(
        `UPDATE orders SET order_number=@orderNumber, customer_first_name=@customerFirstName, customer_last_name=@customerLastName,
         customer_instagram=@customerInstagram, delivery_address=@deliveryAddress, total_amount=@totalAmount, status=@status WHERE id=@id`
      ).run({
        id,
        orderNumber,
        customerFirstName,
        customerLastName,
        customerInstagram,
        deliveryAddress,
        totalAmount,
        status
      });
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
      const insertItem = db.prepare(
        'INSERT INTO order_items (order_id, product_id, quantity, price, discount) VALUES (?, ?, ?, ?, ?)'
      );
      const txn = db.transaction((orderItems: any[]) => {
        for (const item of orderItems) {
          insertItem.run(id, item.productId, item.quantity, item.price, item.discount);
        }
      });
      txn(items);
      return { id, totalAmount };
    } else {
      const insert = db.prepare(
        `INSERT INTO orders (order_number, customer_first_name, customer_last_name, customer_instagram, delivery_address, total_amount, status)
         VALUES (@orderNumber, @customerFirstName, @customerLastName, @customerInstagram, @deliveryAddress, @totalAmount, @status)`
      );
      const result = insert.run({
        orderNumber,
        customerFirstName,
        customerLastName,
        customerInstagram,
        deliveryAddress,
        totalAmount,
        status
      });
      const orderId = Number(result.lastInsertRowid);
      const insertItem = db.prepare(
        'INSERT INTO order_items (order_id, product_id, quantity, price, discount) VALUES (?, ?, ?, ?, ?)'
      );
      const txn = db.transaction((orderItems: any[]) => {
        for (const item of orderItems) {
          insertItem.run(orderId, item.productId, item.quantity, item.price, item.discount);
        }
      });
      txn(items);
      return { id: orderId, totalAmount };
    }
  });

  ipcMain.handle('orders:delete', (_event, id: number) => {
    db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('orders:generateNumber', () => {
    const stmt = db.prepare('SELECT order_number FROM orders ORDER BY id DESC LIMIT 1');
    const lastOrder = stmt.get() as { order_number: string } | undefined;
    if (!lastOrder) {
      return 'LNG-0001';
    }
    const numeric = Number(lastOrder.order_number.split('-')[1]) + 1;
    return `LNG-${numeric.toString().padStart(4, '0')}`;
  });

  ipcMain.handle('reports:overview', () => {
    const totalRevenueRow = db.prepare("SELECT SUM(total_amount) as revenue FROM orders WHERE status = 'completed'").get() as {
      revenue: number | null;
    };
    const ordersByStatus = db.prepare('SELECT status, COUNT(*) as count FROM orders GROUP BY status').all();
    const productCountRow = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
    const materialStats = db.prepare(
      'SELECT COUNT(*) as count, SUM(quantity * price_per_unit) as value FROM materials'
    ).get() as { count: number; value: number | null };
    const topProducts = db.prepare(
      `SELECT p.name, SUM(oi.quantity) as total_sales
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'completed'
       GROUP BY p.id
       ORDER BY total_sales DESC
       LIMIT 5`
    ).all();

    const salesTrend = db
      .prepare(
        `SELECT strftime('%Y-%m', created_at) as period, SUM(total_amount) as total
         FROM orders
         WHERE status IN ('completed', 'shipped')
         GROUP BY period
         ORDER BY period`
      )
      .all();

    const profitability = db.prepare('SELECT name, profit FROM products ORDER BY profit DESC LIMIT 5').all();

    const expenseTotals = db
      .prepare(
        `SELECT
           SUM(cost_price) as materialsCost,
           SUM(sewing_cost) as sewingCost,
           SUM(packaging_cost) as packagingCost,
           SUM(shipping_cost) as shippingCost,
           SUM(advertising_cost) as advertisingCost
         FROM products`
      )
      .get() as {
        materialsCost: number | null;
        sewingCost: number | null;
        packagingCost: number | null;
        shippingCost: number | null;
        advertisingCost: number | null;
      };

    const expenseBreakdown = [
      { label: 'Матеріали', value: expenseTotals.materialsCost ?? 0 },
      { label: 'Пошив', value: expenseTotals.sewingCost ?? 0 },
      { label: 'Упаковка', value: expenseTotals.packagingCost ?? 0 },
      { label: 'Доставка', value: expenseTotals.shippingCost ?? 0 },
      { label: 'Реклама', value: expenseTotals.advertisingCost ?? 0 }
    ];

    return {
      revenue: totalRevenueRow.revenue ?? 0,
      ordersByStatus,
      productCount: productCountRow.count,
      materialStats: {
        count: materialStats.count,
        value: materialStats.value ?? 0
      },
      topProducts,
      salesTrend,
      profitability,
      expenseBreakdown
    };
  });
}
