import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { getDatabase, MaterialRecord, OrderRecord, ProductRecord, ClientRecord } from '../../db/database';

const PHOTO_DIRECTORIES = {
  product: 'product-photos',
  material: 'material-photos'
} as const;

type PhotoScope = keyof typeof PHOTO_DIRECTORIES;

function getPhotosDirectory(scope: PhotoScope = 'product') {
  return path.join(app.getPath('userData'), PHOTO_DIRECTORIES[scope]);
}

function ensurePhotosDirectory(scope: PhotoScope = 'product') {
  const directory = getPhotosDirectory(scope);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function resolvePhotoPath(storedPath: string | null | undefined, scope: PhotoScope = 'product') {
  if (!storedPath) {
    return null;
  }
  if (path.isAbsolute(storedPath)) {
    return storedPath;
  }
  const absolute = path.join(app.getPath('userData'), storedPath);
  if (fs.existsSync(absolute)) {
    return absolute;
  }
  return path.join(getPhotosDirectory(scope), storedPath);
}

function generatePhotoRelativePath(originalName: string, scope: PhotoScope = 'product') {
  const timestamp = Date.now();
  const ext = path.extname(originalName) || '.png';
  const slug = originalName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  const baseName = slug ? slug.replace(/^-+|-+$/g, '') : 'photo';
  const random = Math.floor(Math.random() * 1_000_000);
  return path.join(PHOTO_DIRECTORIES[scope], `${baseName || 'photo'}-${timestamp}-${random}${ext}`);
}

function deleteStoredPhoto(storedPath: string | null | undefined, scope: PhotoScope = 'product') {
  if (!storedPath) {
    return;
  }
  const absolute = resolvePhotoPath(storedPath, scope);
  if (absolute && fs.existsSync(absolute)) {
    try {
      fs.unlinkSync(absolute);
    } catch (error) {
      // Ignore file deletion errors to avoid crashing the flow.
    }
  }
}

function persistPhotoFromPayload(
  payload: { originalName: string; filePath: string },
  scope: PhotoScope
): string {
  const sourcePath = payload.filePath;
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Вибраний файл більше не існує. Будь ласка, оберіть його знову.');
  }
  ensurePhotosDirectory(scope);
  const relativePath = generatePhotoRelativePath(payload.originalName, scope);
  const destination = path.join(app.getPath('userData'), relativePath);
  fs.copyFileSync(sourcePath, destination);
  return relativePath;
}

function mapMaterialRecord(record: MaterialRecord) {
  const absolutePhoto = resolvePhotoPath(record.photo ?? undefined, 'material');
  const fileUrl = absolutePhoto && fs.existsSync(absolutePhoto) ? pathToFileURL(absolutePhoto).toString() : undefined;
  const remoteUrl = !fileUrl && record.photo && /^https?:\/\//i.test(record.photo) ? record.photo : undefined;
  const photoUrl = fileUrl ?? remoteUrl;

  return {
    id: record.id,
    name: record.name,
    category: record.category,
    unit: record.unit,
    quantity: record.quantity,
    pricePerUnit: record.price_per_unit,
    photoUrl,
    photoPath: record.photo ?? null
  };
}

function calculateDiscount(type: 'none' | 'percent' | 'fixed', value: number, salePrice: number) {
  if (type === 'percent') {
    return Math.max(0, Math.min(100, value)) * salePrice * 0.01;
  }
  if (type === 'fixed') {
    return Math.max(0, value);
  }
  return 0;
}

function normalizePhone(phone?: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

function sanitizeInstagram(handle?: string | null) {
  if (!handle) return null;
  const trimmed = handle.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^@+/, '');
}

function mapExpensesForLegacyColumns(expenses: Array<{ label: string; amount: number }>) {
  let sewing = 0;
  let packaging = 0;
  let shipping = 0;
  let advertising = 0;

  for (const expense of expenses) {
    const normalized = expense.label.toLowerCase();
    if (normalized.includes('пошив') || normalized.includes('шит')) {
      sewing += expense.amount;
      continue;
    }
    if (normalized.includes('упаков')) {
      packaging += expense.amount;
      continue;
    }
    if (normalized.includes('логист') || normalized.includes('достав') || normalized.includes('shipping')) {
      shipping += expense.amount;
      continue;
    }
    if (normalized.includes('реклам') || normalized.includes('marketing')) {
      advertising += expense.amount;
      continue;
    }
  }

  return { sewing, packaging, shipping, advertising };
}

export function registerIpcHandlers() {
  const db = getDatabase();
  const findClientStmt = db.prepare(
    `SELECT * FROM clients
       WHERE ((@instagram IS NOT NULL AND instagram IS NOT NULL AND LOWER(instagram) = LOWER(@instagram))
          OR (@phone IS NOT NULL AND phone IS NOT NULL AND phone = @phone))
       ORDER BY id
       LIMIT 1`
  );
  const insertClientStmt = db.prepare(
    `INSERT INTO clients (instagram, first_name, last_name, phone, birth_date)
     VALUES (@instagram, @firstName, @lastName, @phone, @birthDate)`
  );
  const updateClientStmt = db.prepare(
    `UPDATE clients
        SET instagram = COALESCE(@instagram, instagram),
            first_name = CASE WHEN LENGTH(@firstName) > 0 THEN @firstName ELSE first_name END,
            last_name = CASE WHEN LENGTH(@lastName) > 0 THEN @lastName ELSE last_name END,
            phone = COALESCE(@phone, phone),
            birth_date = COALESCE(@birthDate, birth_date)
      WHERE id = @id`
  );
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
    ensurePhotosDirectory('material');
    const stmt = db.prepare('SELECT * FROM materials ORDER BY name');
    const materials = stmt.all() as MaterialRecord[];
    return materials.map(mapMaterialRecord);
  });

  ipcMain.handle('materials:create', (_event, payload) => {
    const { newPhoto, ...rest } = payload as {
      name: string;
      category: string;
      unit: 'meters' | 'pieces';
      quantity: number;
      pricePerUnit: number;
      newPhoto?: { originalName: string; filePath: string };
    };

    let photoPath: string | null = null;
    if (newPhoto) {
      photoPath = persistPhotoFromPayload(newPhoto, 'material');
    }

    const insert = db.prepare(
      'INSERT INTO materials (name, category, unit, quantity, price_per_unit, photo) VALUES (@name, @category, @unit, @quantity, @pricePerUnit, @photo)'
    );
    const result = insert.run({ ...rest, photo: photoPath });
    const created = db.prepare('SELECT * FROM materials WHERE id = ?').get(result.lastInsertRowid) as MaterialRecord;
    return mapMaterialRecord(created);
  });

  ipcMain.handle('materials:update', (_event, id: number, payload) => {
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(id) as MaterialRecord | undefined;
    if (!material) {
      throw new Error('Матеріал не знайдено');
    }

    const { newPhoto, removePhoto, ...rest } = payload as {
      name: string;
      category: string;
      unit: 'meters' | 'pieces';
      quantity: number;
      pricePerUnit: number;
      newPhoto?: { originalName: string; filePath: string };
      removePhoto?: boolean;
    };

    let photoPath: string | null = material.photo ?? null;

    if (removePhoto && photoPath) {
      deleteStoredPhoto(photoPath, 'material');
      photoPath = null;
    }

    if (newPhoto) {
      if (photoPath) {
        deleteStoredPhoto(photoPath, 'material');
      }
      photoPath = persistPhotoFromPayload(newPhoto, 'material');
    }

    const update = db.prepare(
      'UPDATE materials SET name=@name, category=@category, unit=@unit, quantity=@quantity, price_per_unit=@pricePerUnit, photo=@photo WHERE id=@id'
    );
    update.run({ ...rest, photo: photoPath, id });
    const updated = db.prepare('SELECT * FROM materials WHERE id = ?').get(id) as MaterialRecord;
    return mapMaterialRecord(updated);
  });

  ipcMain.handle(
    'materials:receipt',
    (_event, materialId: number, payload: { quantity: number; unitPrice: number; comment?: string; date?: string }) => {
      const quantity = Number(payload.quantity);
      const unitPrice = Number(payload.unitPrice);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('Кількість повинна бути більшою за 0');
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error('Ціна за одиницю повинна бути невідʼємною');
      }

      const material = db
        .prepare('SELECT * FROM materials WHERE id = ?')
        .get(materialId) as MaterialRecord | undefined;

      if (!material) {
        throw new Error('Матеріал не знайдено');
      }

      const previousQuantity = Number(material.quantity) || 0;
      const previousPrice = Number(material.price_per_unit) || 0;
      const newQuantity = previousQuantity + quantity;
      const totalValue = previousQuantity * previousPrice + quantity * unitPrice;
      const newPricePerUnit = newQuantity > 0 ? totalValue / newQuantity : 0;

      let receivedAt = new Date();
      if (payload.date) {
        const parsed = new Date(payload.date);
        if (!Number.isNaN(parsed.getTime())) {
          receivedAt = parsed;
        }
      }

      db.prepare(
        'INSERT INTO material_receipts (material_id, quantity, unit_price, comment, received_at) VALUES (?, ?, ?, ?, ?)' 
      ).run(materialId, quantity, unitPrice, payload.comment?.trim() || null, receivedAt.toISOString());

      db.prepare('UPDATE materials SET quantity = ?, price_per_unit = ? WHERE id = ?').run(
        newQuantity,
        newPricePerUnit,
        materialId
      );

      const updated = db
        .prepare('SELECT * FROM materials WHERE id = ?')
        .get(materialId) as MaterialRecord;

      return mapMaterialRecord(updated);
    }
  );

  ipcMain.handle('materials:delete', (_event, id: number) => {
    const existing = db.prepare('SELECT photo FROM materials WHERE id = ?').get(id) as { photo?: string | null } | undefined;
    if (existing?.photo) {
      deleteStoredPhoto(existing.photo, 'material');
    }
    const del = db.prepare('DELETE FROM materials WHERE id = ?');
    del.run(id);
    return { success: true };
  });

  ipcMain.handle('products:list', () => {
    ensurePhotosDirectory();
    const products = db.prepare('SELECT * FROM products ORDER BY name').all() as ProductRecord[];
    const materialsStmt = db.prepare(
      `SELECT pm.*, m.name as material_name, m.unit as material_unit, m.price_per_unit as material_price, m.quantity as material_stock
       FROM product_materials pm
       JOIN materials m ON pm.material_id = m.id
       WHERE pm.product_id = ?`
    );
    const photosStmt = db.prepare('SELECT id, file_path FROM product_photos WHERE product_id = ? ORDER BY id');
    const expensesStmt = db.prepare('SELECT id, label, amount FROM product_expenses WHERE product_id = ? ORDER BY id');

    return products.map((product) => {
      const materials = materialsStmt.all(product.id).map((row: any) => ({
        id: row.material_id,
        name: row.material_name,
        unit: row.material_unit,
        pricePerUnit: row.material_price,
        quantity: row.quantity,
        availableQuantity: row.material_stock
      }));
      const materialsCost = materials.reduce(
        (total: number, material: any) => total + material.pricePerUnit * material.quantity,
        0
      );

      let expenses = expensesStmt.all(product.id) as Array<{ id: number; label: string; amount: number }>;
      let additionalCost = expenses.reduce((total, expense) => total + expense.amount, 0);

      if (expenses.length === 0) {
        const legacyExpenses = [
          { label: 'Пошив', amount: product.sewing_cost },
          { label: 'Упаковка', amount: product.packaging_cost },
          { label: 'Логістика', amount: product.shipping_cost },
          { label: 'Реклама', amount: product.advertising_cost }
        ].filter((entry) => (entry.amount ?? 0) > 0);
        if (legacyExpenses.length > 0) {
          expenses = legacyExpenses.map((entry) => ({ ...entry }));
          additionalCost = legacyExpenses.reduce((total, entry) => total + entry.amount, 0);
        }
      }

      const discountAmount = calculateDiscount(product.discount_type, product.discount_value, product.sale_price);
      const effectiveSalePrice = Math.max(0, product.sale_price - discountAmount);
      const costPrice = materialsCost + additionalCost;
      const profit = effectiveSalePrice - costPrice;

      const capacity = materials.length
        ? Math.min(
            ...materials
              .filter((material) => material.quantity > 0)
              .map((material) => Math.floor(material.availableQuantity / material.quantity) || 0)
          )
        : 0;

      const photos = photosStmt.all(product.id).flatMap((row: any) => {
        const absolutePath = resolvePhotoPath(row.file_path);
        if (!absolutePath || !fs.existsSync(absolutePath)) {
          return [] as any[];
        }
        return [
          {
            id: row.id,
            path: row.file_path,
            url: pathToFileURL(absolutePath).toString()
          }
        ];
      });

      return {
        id: product.id,
        name: product.name,
        description: product.description ?? '',
        materials,
        materialsCost,
        additionalExpenses: expenses,
        additionalCost,
        costPrice,
        salePrice: product.sale_price,
        discountType: product.discount_type,
        discountValue: product.discount_value,
        discountAmount,
        effectiveSalePrice,
        profit,
        photos,
        maxProductionQuantity: Number.isFinite(capacity) ? capacity : 0
      };
    });
  });

  ipcMain.handle('products:save', async (_event, payload) => {
    const {
      id,
      name,
      description,
      materials,
      salePrice,
      discount,
      additionalExpenses,
      photosToKeep = [],
      newPhotos = []
    } = payload as {
      id?: number;
      name: string;
      description?: string;
      materials: Array<{ id: number; quantity: number; pricePerUnit: number }>;
      salePrice: number;
      discount?: { type: 'none' | 'percent' | 'fixed'; value: number };
      additionalExpenses: Array<{ label: string; amount: number }>;
      photosToKeep?: number[];
      newPhotos?: Array<{ originalName: string; filePath: string }>;
    };

    ensurePhotosDirectory();

    const normalizedMaterials = (materials ?? []).filter((item) => item.id && item.quantity > 0);
    const normalizedExpenses = (additionalExpenses ?? []).filter((expense) => expense.label?.trim());
    const materialsCost = normalizedMaterials.reduce(
      (acc, item) => acc + (Number(item.pricePerUnit) || 0) * (Number(item.quantity) || 0),
      0
    );
    const additionalCost = normalizedExpenses.reduce((acc, expense) => acc + (Number(expense.amount) || 0), 0);
    const discountType = discount?.type ?? 'none';
    const discountValue = Number(discount?.value ?? 0);
    const costPrice = materialsCost + additionalCost;
    const discountAmount = calculateDiscount(discountType, discountValue, salePrice);
    const effectiveSalePrice = Math.max(0, salePrice - discountAmount);
    const profit = effectiveSalePrice - costPrice;

    const { sewing, packaging, shipping, advertising } = mapExpensesForLegacyColumns(normalizedExpenses);

    let productId = id;

    if (productId) {
      const update = db.prepare(
        `UPDATE products SET
           name=@name,
           description=@description,
           materials_cost=@materialsCost,
           additional_cost=@additionalCost,
           cost_price=@costPrice,
           sewing_cost=@sewingCost,
           packaging_cost=@packagingCost,
           shipping_cost=@shippingCost,
           advertising_cost=@advertisingCost,
           sale_price=@salePrice,
           discount_type=@discountType,
           discount_value=@discountValue,
           profit=@profit
         WHERE id=@id`
      );
      update.run({
        id: productId,
        name,
        description,
        materialsCost,
        additionalCost,
        costPrice,
        sewingCost: sewing,
        packagingCost: packaging,
        shippingCost: shipping,
        advertisingCost: advertising,
        salePrice,
        discountType,
        discountValue,
        profit
      });
      db.prepare('DELETE FROM product_materials WHERE product_id = ?').run(productId);
      db.prepare('DELETE FROM product_expenses WHERE product_id = ?').run(productId);
    } else {
      const insert = db.prepare(
        `INSERT INTO products (
           name,
           description,
           materials_cost,
           additional_cost,
           cost_price,
           sewing_cost,
           packaging_cost,
           shipping_cost,
           advertising_cost,
           sale_price,
           discount_type,
           discount_value,
           profit
         ) VALUES (
           @name,
           @description,
           @materialsCost,
           @additionalCost,
           @costPrice,
           @sewingCost,
           @packagingCost,
           @shippingCost,
           @advertisingCost,
           @salePrice,
           @discountType,
           @discountValue,
           @profit
         )`
      );
      const result = insert.run({
        name,
        description,
        materialsCost,
        additionalCost,
        costPrice,
        sewingCost: sewing,
        packagingCost: packaging,
        shippingCost: shipping,
        advertisingCost: advertising,
        salePrice,
        discountType,
        discountValue,
        profit
      });
      productId = Number(result.lastInsertRowid);
    }

    const insertMaterial = db.prepare(
      'INSERT INTO product_materials (product_id, material_id, quantity) VALUES (?, ?, ?)'
    );
    const materialTxn = db.transaction((items: typeof normalizedMaterials) => {
      for (const item of items) {
        insertMaterial.run(productId, item.id, item.quantity);
      }
    });
    materialTxn(normalizedMaterials);

    const insertExpense = db.prepare(
      'INSERT INTO product_expenses (product_id, label, amount) VALUES (?, ?, ?)'
    );
    const expenseTxn = db.transaction((expenses: typeof normalizedExpenses) => {
      for (const expense of expenses) {
        insertExpense.run(productId, expense.label.trim(), expense.amount);
      }
    });
    expenseTxn(normalizedExpenses);

    const existingPhotosStmt = db.prepare(
      'SELECT id, file_path FROM product_photos WHERE product_id = ? ORDER BY id'
    );
    const existingPhotos = existingPhotosStmt.all(productId) as Array<{ id: number; file_path: string }>;
    const photosToRemove = existingPhotos.filter((photo) => !photosToKeep.includes(photo.id));

    const deletePhotoStmt = db.prepare('DELETE FROM product_photos WHERE id = ?');
    for (const photo of photosToRemove) {
      deletePhotoStmt.run(photo.id);
      const absolute = resolvePhotoPath(photo.file_path);
      if (absolute && fs.existsSync(absolute)) {
        try {
          fs.unlinkSync(absolute);
        } catch (error) {
          console.error('Failed to delete photo', error);
        }
      }
    }

    const insertPhoto = db.prepare('INSERT INTO product_photos (product_id, file_path) VALUES (?, ?)');
    for (const photo of newPhotos) {
      if (!photo.filePath) continue;
      const relativePath = generatePhotoRelativePath(photo.originalName ?? 'photo');
      const destination = path.join(app.getPath('userData'), relativePath);
      const source = resolvePhotoPath(photo.filePath) ?? photo.filePath;
      try {
        fs.copyFileSync(source, destination);
        insertPhoto.run(productId, relativePath);
      } catch (error) {
        console.error('Failed to store product photo', error);
      }
    }

    return {
      id: productId,
      costPrice,
      materialsCost,
      additionalCost,
      discountAmount,
      effectiveSalePrice,
      profit
    };
  });

  ipcMain.handle('products:delete', (_event, id: number) => {
    const photoRows = db
      .prepare('SELECT file_path FROM product_photos WHERE product_id = ?')
      .all(id) as Array<{ file_path: string }>;

    db.prepare('DELETE FROM products WHERE id = ?').run(id);

    for (const row of photoRows) {
      const absolute = resolvePhotoPath(row.file_path);
      if (absolute && fs.existsSync(absolute)) {
        try {
          fs.unlinkSync(absolute);
        } catch (error) {
          console.error('Failed to delete photo', error);
        }
      }
    }

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
    const {
      id,
      orderNumber,
      customerFirstName,
      customerLastName,
      customerInstagram,
      customerPhone,
      customerBirthDate,
      deliveryAddress,
      items,
      status,
      clientId: payloadClientId
    } = payload;
    const trimmedFirstName = (customerFirstName ?? '').trim();
    const trimmedLastName = (customerLastName ?? '').trim();
    const sanitizedInstagram = sanitizeInstagram(customerInstagram);
    const normalizedPhone = normalizePhone(customerPhone);
    const normalizedBirthDate =
      typeof customerBirthDate === 'string' && customerBirthDate.length > 0 ? customerBirthDate : null;

    let clientId: number | null = payloadClientId ?? null;

    if (clientId) {
      const existingClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as
        | ClientRecord
        | undefined;
      if (existingClient) {
        updateClientStmt.run({
          id: existingClient.id,
          instagram: sanitizedInstagram ?? existingClient.instagram,
          firstName: trimmedFirstName || existingClient.first_name,
          lastName: trimmedLastName || existingClient.last_name,
          phone: normalizedPhone ?? existingClient.phone,
          birthDate: normalizedBirthDate ?? existingClient.birth_date
        });
      } else {
        clientId = null;
      }
    }

    if (!clientId && (sanitizedInstagram || normalizedPhone)) {
      const existing = findClientStmt.get({ instagram: sanitizedInstagram, phone: normalizedPhone }) as
        | ClientRecord
        | undefined;
      if (existing) {
        clientId = existing.id;
        updateClientStmt.run({
          id: existing.id,
          instagram: sanitizedInstagram ?? existing.instagram,
          firstName: trimmedFirstName || existing.first_name,
          lastName: trimmedLastName || existing.last_name,
          phone: normalizedPhone ?? existing.phone,
          birthDate: normalizedBirthDate ?? existing.birth_date
        });
      }
    }

    if (!clientId && (trimmedFirstName || trimmedLastName || sanitizedInstagram || normalizedPhone)) {
      const inserted = insertClientStmt.run({
        instagram: sanitizedInstagram ?? null,
        firstName: trimmedFirstName || 'Клієнт',
        lastName: trimmedLastName || null,
        phone: normalizedPhone ?? null,
        birthDate: normalizedBirthDate ?? null
      });
      clientId = Number(inserted.lastInsertRowid);
    }

    const totalAmount = items.reduce(
      (acc: number, item: any) => acc + (item.price - item.discount) * item.quantity,
      0
    );

    if (id) {
      db.prepare(
        `UPDATE orders SET order_number=@orderNumber, customer_first_name=@customerFirstName, customer_last_name=@customerLastName,
         customer_instagram=@customerInstagram, customer_phone=@customerPhone, customer_birth_date=@customerBirthDate,
         client_id=@clientId, delivery_address=@deliveryAddress, total_amount=@totalAmount, status=@status WHERE id=@id`
      ).run({
        id,
        orderNumber,
        customerFirstName: trimmedFirstName,
        customerLastName: trimmedLastName,
        customerInstagram: sanitizedInstagram ?? null,
        customerPhone: normalizedPhone ?? null,
        customerBirthDate: normalizedBirthDate,
        clientId,
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
        `INSERT INTO orders (order_number, customer_first_name, customer_last_name, customer_instagram, customer_phone, customer_birth_date, client_id, delivery_address, total_amount, status)
         VALUES (@orderNumber, @customerFirstName, @customerLastName, @customerInstagram, @customerPhone, @customerBirthDate, @clientId, @deliveryAddress, @totalAmount, @status)`
      );
      const result = insert.run({
        orderNumber,
        customerFirstName: trimmedFirstName || 'Клієнт',
        customerLastName: trimmedLastName || '',
        customerInstagram: sanitizedInstagram ?? null,
        customerPhone: normalizedPhone ?? null,
        customerBirthDate: normalizedBirthDate,
        clientId,
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

  ipcMain.handle('clients:list', () => {
    const clients = db
      .prepare(
        `SELECT c.*, COUNT(o.id) as total_orders, MAX(o.created_at) as last_order_at,
                SUM(CASE WHEN o.status = 'completed' THEN o.total_amount ELSE 0 END) as completed_revenue
           FROM clients c
           LEFT JOIN orders o ON o.client_id = c.id
          GROUP BY c.id
          ORDER BY LOWER(c.first_name || ' ' || COALESCE(c.last_name, ''))`
      )
      .all() as Array<
      ClientRecord & {
        total_orders: number;
        last_order_at: string | null;
        completed_revenue: number | null;
      }
    >;

    return clients.map((client) => ({
      id: client.id,
      instagram: client.instagram,
      firstName: client.first_name,
      lastName: client.last_name,
      phone: client.phone,
      birthDate: client.birth_date,
      createdAt: client.created_at,
      totalOrders: client.total_orders,
      lastOrderAt: client.last_order_at,
      completedRevenue: client.completed_revenue ?? 0
    }));
  });

  ipcMain.handle('clients:salesStats', (_event, filters: { startDate?: string; endDate?: string } = {}) => {
    const conditions = ["status = 'completed'"];
    const params: Record<string, unknown> = {};

    if (filters.startDate) {
      conditions.push('date(created_at) >= date(@startDate)');
      params.startDate = filters.startDate;
    }

    if (filters.endDate) {
      conditions.push('date(created_at) <= date(@endDate)');
      params.endDate = filters.endDate;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db
      .prepare(
        `SELECT date(created_at) as sale_date, COUNT(*) as orders, SUM(total_amount) as revenue
           FROM orders
           ${whereClause}
          GROUP BY sale_date
          ORDER BY sale_date`
      )
      .all(params) as Array<{ sale_date: string; orders: number; revenue: number | null }>;

    return rows.map((row) => ({
      date: row.sale_date,
      orders: row.orders,
      revenue: row.revenue ?? 0
    }));
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
           SUM(materials_cost) as materialsCost,
           SUM(additional_cost) as additionalCost
         FROM products`
      )
      .get() as {
        materialsCost: number | null;
        additionalCost: number | null;
      };

    const additionalBreakdown = db
      .prepare(
        `SELECT label, SUM(amount) as total
         FROM product_expenses
         GROUP BY label
         ORDER BY total DESC`
      )
      .all() as Array<{ label: string; total: number }>;

    const expenseBreakdown = [
      { label: 'Матеріали', value: expenseTotals.materialsCost ?? 0 },
      ...additionalBreakdown.map((row) => ({ label: row.label, value: row.total }))
    ];

    const totalAdditionalFromBreakdown = additionalBreakdown.reduce(
      (sum, row) => sum + row.total,
      0
    );

    if ((expenseTotals.additionalCost ?? 0) > totalAdditionalFromBreakdown) {
      expenseBreakdown.push({
        label: 'Інші витрати',
        value: (expenseTotals.additionalCost ?? 0) - totalAdditionalFromBreakdown
      });
    }

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
