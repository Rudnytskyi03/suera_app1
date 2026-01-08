import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import {
  getDatabase,
  MaterialRecord,
  OrderRecord,
  ProductRecord,
  ClientRecord,
  FinishedInventoryRecord,
  FinishedBatchRecord
} from '../../db/database';

const PHOTO_DIRECTORIES = {
  product: 'product-photos',
  material: 'material-photos'
} as const;

const FINISHED_COMPONENTS = ['bra', 'panties', 'belt', 'garter'] as const;

type FinishedComponent = (typeof FINISHED_COMPONENTS)[number];

const FINISHED_COMPONENT_LABELS: Record<FinishedComponent, string> = {
  bra: 'Бра',
  panties: 'Трусики',
  belt: 'Пояс',
  garter: 'Гартер'
};

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

function normalizeFinishedSize(size: string) {
  const trimmed = (size ?? '').trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : 'UNSIZED';
}

function normalizeUnderwireSizeInput(size: string | null | undefined) {
  if (typeof size !== 'string') {
    return null;
  }
  const trimmed = size.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toUpperCase();
}

type UnderwireUsage = {
  materialId: number;
  available: number;
  required: number;
  size: string;
  unitsPerBra: number;
};

function computeUnderwireUsage(
  db: ReturnType<typeof getDatabase>,
  size: string,
  braCount: number
): UnderwireUsage | null {
  if (braCount <= 0) {
    return null;
  }
  const normalizedSize = normalizeFinishedSize(size);
  if (normalizedSize === 'UNSIZED') {
    throw new Error('Для бра потрібно вказати розмір, щоб списати косточки зі складу.');
  }
  const row = db
    .prepare(
      `SELECT m.id, m.quantity, m.underwire_units_per_bra
         FROM materials m
         JOIN material_underwire_sizes mus ON mus.material_id = m.id
        WHERE mus.size = ?
        ORDER BY m.quantity DESC, m.id ASC
        LIMIT 1`
    )
    .get(normalizedSize) as { id: number; quantity: number; underwire_units_per_bra: number } | undefined;

  const fallbackRow =
    row ||
    (db
      .prepare('SELECT id, quantity, underwire_units_per_bra FROM materials WHERE bra_underwire_size = ?')
      .get(normalizedSize) as { id: number; quantity: number; underwire_units_per_bra: number } | undefined);

  if (!fallbackRow) {
    throw new Error(`Не налаштовано косточки для розміру ${normalizedSize}. Додайте матеріал у довіднику.`);
  }

  const unitsPerBra = Number(fallbackRow.underwire_units_per_bra ?? 0);
  if (!Number.isFinite(unitsPerBra) || unitsPerBra <= 0) {
    throw new Error(`Вкажіть кількість косточок на один бра для розміру ${normalizedSize}.`);
  }

  const available = Number(fallbackRow.quantity) || 0;
  const required = unitsPerBra * braCount;
  return {
    materialId: fallbackRow.id,
    available,
    required,
    size: normalizedSize,
    unitsPerBra
  };
}

function ensureFinishedComponent(component: string): FinishedComponent {
  if (FINISHED_COMPONENTS.includes(component as FinishedComponent)) {
    return component as FinishedComponent;
  }
  throw new Error('Невідома категорія готового виробу');
}

function applyFinishedInventoryDelta(
  db: ReturnType<typeof getDatabase>,
  productId: number,
  component: FinishedComponent,
  size: string,
  delta: number
) {
  const normalizedSize = normalizeFinishedSize(size);
  const existing = db
    .prepare('SELECT id, quantity FROM finished_inventory WHERE product_id = ? AND component = ? AND size = ?')
    .get(productId, component, normalizedSize) as { id: number; quantity: number } | undefined;

  if (existing) {
    const nextQuantity = existing.quantity + delta;
    if (nextQuantity < 0) {
      throw new Error(
        `Недостатньо готових виробів (${FINISHED_COMPONENT_LABELS[component]} ${normalizedSize}) для товару`
      );
    }
    db.prepare('UPDATE finished_inventory SET quantity = ? WHERE id = ?').run(nextQuantity, existing.id);
  } else {
    if (delta < 0) {
      throw new Error(
        `На складі немає готових виробів (${FINISHED_COMPONENT_LABELS[component]} ${normalizedSize}) для списання`
      );
    }
    db
      .prepare(
        'INSERT INTO finished_inventory (product_id, component, size, quantity) VALUES (?, ?, ?, ?)' as const
      )
      .run(productId, component, normalizedSize, delta);
  }
}

function computeTotalSets(components: Record<FinishedComponent, number>) {
  const counts = FINISHED_COMPONENTS.map((component) => components[component] ?? 0).filter((value) => value > 0);
  if (counts.length === 0) {
    return 0;
  }
  return Math.min(...counts);
}

type AllocationPayload = {
  component: string;
  size: string;
  quantity: number;
};

function groupAllocationsByComponent(allocations: AllocationPayload[]) {
  const grouped: Record<FinishedComponent, { total: number; bySize: Record<string, number> }> = {
    bra: { total: 0, bySize: {} },
    panties: { total: 0, bySize: {} },
    belt: { total: 0, bySize: {} },
    garter: { total: 0, bySize: {} }
  };

  for (const allocation of allocations) {
    const component = ensureFinishedComponent(allocation.component);
    const normalizedSize = normalizeFinishedSize(allocation.size);
    const amount = Math.max(0, Math.floor(allocation.quantity ?? 0));
    if (amount === 0) {
      continue;
    }
    grouped[component].total += amount;
    grouped[component].bySize[normalizedSize] = (grouped[component].bySize[normalizedSize] ?? 0) + amount;
  }

  return grouped;
}

function restoreFinishedInventoryForOrder(db: ReturnType<typeof getDatabase>, orderId: number) {
  const rows = db
    .prepare(
      `SELECT oi.product_id, ofa.component, ofa.size, ofa.quantity
         FROM order_finished_allocations ofa
         JOIN order_items oi ON oi.id = ofa.order_item_id
        WHERE oi.order_id = ?`
    )
    .all(orderId) as Array<{ product_id: number; component: string; size: string; quantity: number }>;

  for (const row of rows) {
    const component = ensureFinishedComponent(row.component);
    applyFinishedInventoryDelta(db, row.product_id, component, row.size, row.quantity);
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

function getUnderwireSizes(db: ReturnType<typeof getDatabase>, materialId: number) {
  const rows = db
    .prepare('SELECT size FROM material_underwire_sizes WHERE material_id = ? ORDER BY size')
    .all(materialId) as Array<{ size: string }>;

  const normalized = rows
    .map((row) => normalizeFinishedSize(row.size))
    .filter((value) => value && value !== 'UNSIZED') as string[];

  return Array.from(new Set(normalized));
}

function mapMaterialRecord(db: ReturnType<typeof getDatabase>, record: MaterialRecord) {
  const absolutePhoto = resolvePhotoPath(record.photo ?? undefined, 'material');
  const fileUrl = absolutePhoto && fs.existsSync(absolutePhoto) ? pathToFileURL(absolutePhoto).toString() : undefined;
  const remoteUrl = !fileUrl && record.photo && /^https?:\/\//i.test(record.photo) ? record.photo : undefined;
  const photoUrl = fileUrl ?? remoteUrl;
  let underwireSizes = getUnderwireSizes(db, record.id);
  if (underwireSizes.length === 0 && typeof record.bra_underwire_size === 'string') {
    const legacy = normalizeUnderwireSizeInput(record.bra_underwire_size);
    if (legacy) {
      underwireSizes = [legacy];
    }
  }
  const normalizedUnderwireSize = underwireSizes[0] || null;
  const underwireUnits = normalizedUnderwireSize ? Number(record.underwire_units_per_bra ?? 0) : null;

  return {
    id: record.id,
    name: record.name,
    category: record.category,
    unit: record.unit,
    quantity: record.quantity,
    pricePerUnit: record.price_per_unit,
    photoUrl,
    photoPath: record.photo ?? null,
    braUnderwireSizes: underwireSizes,
    underwireUnitsPerBra: underwireUnits
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

  for (const expense of expenses) {
    const normalized = expense.label.toLowerCase();
    if (normalized.includes('пошив') || normalized.includes('шит')) {
      sewing += expense.amount;
    }
  }

  return { sewing, packaging: 0, shipping: 0, advertising: 0 };
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
    return materials.map((material) => mapMaterialRecord(db, material));
  });

  ipcMain.handle('materials:create', (_event, payload) => {
    const { newPhoto, underwireSizes, underwireUnitsPerBra, ...rest } = payload as {
      name: string;
      category: string;
      unit: 'meters' | 'pieces';
      quantity: number;
      pricePerUnit: number;
      newPhoto?: { originalName: string; filePath: string };
      underwireSizes?: string[];
      underwireUnitsPerBra?: number | null;
    };

    let photoPath: string | null = null;
    if (newPhoto) {
      photoPath = persistPhotoFromPayload(newPhoto, 'material');
    }

    const normalizedUnderwireSizes = Array.from(
      new Set(
        (underwireSizes || [])
          .map((size) => normalizeFinishedSize(size))
          .filter((size): size is string => Boolean(size && size !== 'UNSIZED'))
      )
    );
    const normalizedUnderwireSize = normalizedUnderwireSizes[0] ?? null;
    let normalizedUnderwireUnits = 0;
    if (normalizedUnderwireSizes.length > 0) {
      const parsedUnits = Number(underwireUnitsPerBra);
      if (!Number.isFinite(parsedUnits) || parsedUnits <= 0) {
        throw new Error('Кількість косточок на один бра повинна бути більшою за нуль.');
      }
      normalizedUnderwireUnits = parsedUnits;
    }

    const insert = db.prepare(
      'INSERT INTO materials (name, category, unit, quantity, price_per_unit, photo, bra_underwire_size, underwire_units_per_bra) VALUES (@name, @category, @unit, @quantity, @pricePerUnit, @photo, @braUnderwireSize, @underwireUnitsPerBra)'
    );
    const result = insert.run({
      ...rest,
      photo: photoPath,
      braUnderwireSize: normalizedUnderwireSize,
      underwireUnitsPerBra: normalizedUnderwireUnits
    });
    const created = db.prepare('SELECT * FROM materials WHERE id = ?').get(result.lastInsertRowid) as MaterialRecord;

    const replaceUnderwireSizes = db.prepare(
      'INSERT OR IGNORE INTO material_underwire_sizes (material_id, size) VALUES (?, ?)'
    );
    const replaceTxn = db.transaction((sizes: string[]) => {
      db.prepare('DELETE FROM material_underwire_sizes WHERE material_id = ?').run(created.id);
      for (const size of sizes) {
        replaceUnderwireSizes.run(created.id, size);
      }
    });
    replaceTxn(normalizedUnderwireSizes);

    return mapMaterialRecord(db, created);
  });

  ipcMain.handle('materials:update', (_event, id: number, payload) => {
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(id) as MaterialRecord | undefined;
    if (!material) {
      throw new Error('Матеріал не знайдено');
    }

    const { newPhoto, removePhoto, underwireSizes, underwireUnitsPerBra, ...rest } = payload as {
      name: string;
      category: string;
      unit: 'meters' | 'pieces';
      quantity: number;
      pricePerUnit: number;
      newPhoto?: { originalName: string; filePath: string };
      removePhoto?: boolean;
      underwireSizes?: string[];
      underwireUnitsPerBra?: number | null;
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

    const normalizedUnderwireSizes = Array.from(
      new Set(
        (underwireSizes || [])
          .map((size) => normalizeFinishedSize(size))
          .filter((size): size is string => Boolean(size && size !== 'UNSIZED'))
      )
    );
    const normalizedUnderwireSize = normalizedUnderwireSizes[0] ?? null;
    let normalizedUnderwireUnits = 0;
    if (normalizedUnderwireSizes.length > 0) {
      const parsedUnits = Number(underwireUnitsPerBra);
      if (!Number.isFinite(parsedUnits) || parsedUnits <= 0) {
        throw new Error('Кількість косточок на один бра повинна бути більшою за нуль.');
      }
      normalizedUnderwireUnits = parsedUnits;
    }

    const update = db.prepare(
      'UPDATE materials SET name=@name, category=@category, unit=@unit, quantity=@quantity, price_per_unit=@pricePerUnit, photo=@photo, bra_underwire_size=@braUnderwireSize, underwire_units_per_bra=@underwireUnitsPerBra WHERE id=@id'
    );
    update.run({
      ...rest,
      photo: photoPath,
      id,
      braUnderwireSize: normalizedUnderwireSize,
      underwireUnitsPerBra: normalizedUnderwireUnits
    });

    const replaceUnderwireSizes = db.prepare(
      'INSERT OR IGNORE INTO material_underwire_sizes (material_id, size) VALUES (?, ?)'
    );
    const replaceTxn = db.transaction((sizes: string[]) => {
      db.prepare('DELETE FROM material_underwire_sizes WHERE material_id = ?').run(id);
      for (const size of sizes) {
        replaceUnderwireSizes.run(id, size);
      }
    });
    replaceTxn(normalizedUnderwireSizes);

    const updated = db.prepare('SELECT * FROM materials WHERE id = ?').get(id) as MaterialRecord;
    return mapMaterialRecord(db, updated);
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

  ipcMain.handle('finished:list', () => {
    const rows = db
      .prepare(
        `SELECT fi.*, p.name as product_name
           FROM finished_inventory fi
           JOIN products p ON p.id = fi.product_id
          ORDER BY LOWER(p.name), fi.size`
      )
      .all() as Array<FinishedInventoryRecord & { product_name: string }>;

    const grouped = new Map<
      string,
      {
        productId: number;
        productName: string;
        size: string;
        components: Record<FinishedComponent, number>;
      }
    >();

    for (const row of rows) {
      const component = ensureFinishedComponent(row.component);
      const normalizedSize = normalizeFinishedSize(row.size);
      const key = `${row.product_id}:${normalizedSize}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          productId: row.product_id,
          productName: row.product_name,
          size: normalizedSize,
          components: { bra: 0, panties: 0, belt: 0, garter: 0 }
        });
      }
      const entry = grouped.get(key)!;
      entry.components[component] = row.quantity;
    }

    let counter = 1;
    return Array.from(grouped.values()).map((entry) => ({
      id: counter++,
      productId: entry.productId,
      productName: entry.productName,
      size: entry.size,
      components: entry.components,
      totalSets: computeTotalSets(entry.components)
    }));
  });

  ipcMain.handle('finished:produce', (_event, payload) => {
    const { productId, size, components, sets, producedAt, note, skipMaterialWriteOff, componentSizes } = payload as {
      productId: number;
      size?: string;
      components?: Partial<Record<string, number>>;
      sets?: number;
      producedAt?: string;
      note?: string;
      skipMaterialWriteOff?: boolean;
      componentSizes?: Partial<Record<string, string>>;
    };

    if (!productId) {
      throw new Error('Оберіть товар для списання матеріалів');
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as ProductRecord | undefined;
    if (!product) {
      throw new Error('Товар не знайдено');
    }

    const normalizedComponents: Record<FinishedComponent, number> = {
      bra: 0,
      panties: 0,
      belt: 0,
      garter: 0
    };
    const fallbackSize = normalizeFinishedSize(size ?? '');
    const normalizedComponentSizes: Record<FinishedComponent, string> = {
      bra: fallbackSize,
      panties: fallbackSize,
      belt: fallbackSize,
      garter: fallbackSize
    };

    for (const component of FINISHED_COMPONENTS) {
      const value = components?.[component];
      normalizedComponents[component] = Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;
      const rawSize = componentSizes?.[component];
      const normalizedSize = rawSize ? normalizeFinishedSize(rawSize) : fallbackSize;
      normalizedComponentSizes[component] = normalizedSize;
      if (normalizedComponents[component] > 0 && normalizedSize === 'UNSIZED') {
        throw new Error(`Вкажіть розмір для компонента "${FINISHED_COMPONENT_LABELS[component]}"`);
      }
    }

    const totalPieces = FINISHED_COMPONENTS.reduce((acc, component) => acc + normalizedComponents[component], 0);
    if (totalPieces === 0) {
      throw new Error('Вкажіть кількість хоча б для одного елементу комплекту');
    }

    const setsToProduceCandidate = Number.isFinite(sets) ? Math.max(0, Math.floor(Number(sets))) : 0;
    const inferredSets = computeTotalSets(normalizedComponents);
    const setsToProduce = setsToProduceCandidate > 0 ? setsToProduceCandidate : inferredSets;

    if (setsToProduce <= 0) {
      throw new Error('Кількість комплектів має бути більшою за нуль');
    }

    const producedTimestamp = (() => {
      if (!producedAt) {
        return new Date();
      }
      const parsed = new Date(producedAt);
      return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    })();

    const skipMaterials = Boolean(skipMaterialWriteOff);

    const transaction = db.transaction(() => {
      const underwireUsage =
        !skipMaterials && normalizedComponents.bra > 0
          ? computeUnderwireUsage(db, normalizedComponentSizes.bra, normalizedComponents.bra)
          : null;

      if (!skipMaterials) {
        const materials = db
          .prepare(
            `SELECT pm.material_id, pm.quantity, m.quantity as available_quantity, m.name as material_name
               FROM product_materials pm
               JOIN materials m ON m.id = pm.material_id
              WHERE pm.product_id = ?`
          )
          .all(productId) as Array<{
            material_id: number;
            quantity: number;
            available_quantity: number;
            material_name: string;
          }>;

        for (const material of materials) {
          const required = Number(material.quantity) * setsToProduce;
          const available = Number(material.available_quantity);
          if (required > 0 && available < required) {
            throw new Error(
              `Недостатньо матеріалу "${material.material_name}". Доступно ${available.toFixed(2)}, потрібно ${required.toFixed(2)}`
            );
          }
        }

        if (underwireUsage && underwireUsage.required > 0 && underwireUsage.available < underwireUsage.required) {
          throw new Error(
            `Недостатньо косточок для розміру ${underwireUsage.size}. Доступно ${underwireUsage.available.toFixed(2)}, потрібно ${underwireUsage.required.toFixed(2)}`
          );
        }

        for (const material of materials) {
          const required = Number(material.quantity) * setsToProduce;
          if (required > 0) {
            db.prepare('UPDATE materials SET quantity = quantity - ? WHERE id = ?').run(required, material.material_id);
          }
        }

        if (underwireUsage && underwireUsage.required > 0) {
          db.prepare('UPDATE materials SET quantity = quantity - ? WHERE id = ?').run(
            underwireUsage.required,
            underwireUsage.materialId
          );
        }
      }

      const sizeSummary =
        [normalizedComponentSizes.bra, normalizedComponentSizes.panties, normalizedComponentSizes.belt, normalizedComponentSizes.garter]
          .find((value) => value !== 'UNSIZED') ?? 'UNSIZED';

      db.prepare(
        `INSERT INTO finished_batches (product_id, size, bra_size, panties_size, belt_size, garter_size, sets, bra, panties, belt, garter, note, produced_at, skip_materials)
         VALUES (@productId, @size, @braSize, @pantiesSize, @beltSize, @garterSize, @sets, @bra, @panties, @belt, @garter, @note, @producedAt, @skipMaterials)`
      ).run({
        productId,
        size: sizeSummary,
        braSize: normalizedComponentSizes.bra,
        pantiesSize: normalizedComponentSizes.panties,
        beltSize: normalizedComponentSizes.belt,
        garterSize: normalizedComponentSizes.garter,
        sets: setsToProduce,
        bra: normalizedComponents.bra,
        panties: normalizedComponents.panties,
        belt: normalizedComponents.belt,
        garter: normalizedComponents.garter,
        note: note?.trim() || null,
        producedAt: producedTimestamp.toISOString(),
        skipMaterials: skipMaterials ? 1 : 0
      });

      for (const component of FINISHED_COMPONENTS) {
        const quantity = normalizedComponents[component];
        if (quantity > 0) {
          applyFinishedInventoryDelta(db, productId, component, normalizedComponentSizes[component], quantity);
        }
      }
    });

    transaction();

    return { success: true };
  });

  ipcMain.handle('finished:update', (_event, payload) => {
    const { batchId, size, components, sets, producedAt, note, componentSizes } = payload as {
      batchId: number;
      size?: string;
      components?: Partial<Record<string, number>>;
      sets?: number;
      producedAt?: string;
      note?: string;
      componentSizes?: Partial<Record<string, string>>;
    };

    if (!batchId) {
      throw new Error('Не вдалося визначити партію для редагування');
    }

    const existing = db
      .prepare('SELECT * FROM finished_batches WHERE id = ?')
      .get(batchId) as FinishedBatchRecord | undefined;

    if (!existing) {
      throw new Error('Партію не знайдено');
    }

    const productId = existing.product_id;
    const previousSize = normalizeFinishedSize(existing.size);
    const fallbackSize = normalizeFinishedSize(size ?? existing.size);

    const previousComponents: Record<FinishedComponent, number> = {
      bra: existing.bra,
      panties: existing.panties,
      belt: existing.belt,
      garter: existing.garter
    };
    const previousComponentSizes: Record<FinishedComponent, string> = {
      bra: normalizeFinishedSize(existing.bra_size || existing.size),
      panties: normalizeFinishedSize(existing.panties_size || existing.size),
      belt: normalizeFinishedSize(existing.belt_size || existing.size),
      garter: normalizeFinishedSize(existing.garter_size || existing.size)
    };

    const normalizedComponents: Record<FinishedComponent, number> = { ...previousComponents };
    const normalizedComponentSizes: Record<FinishedComponent, string> = { ...previousComponentSizes };

    for (const component of FINISHED_COMPONENTS) {
      const value = components?.[component];
      if (Number.isFinite(value)) {
        normalizedComponents[component] = Math.max(0, Math.floor(Number(value)));
      }
      const rawSize = componentSizes?.[component];
      const normalizedSize = rawSize ? normalizeFinishedSize(rawSize) : fallbackSize;
      normalizedComponentSizes[component] = normalizedSize;
      if (normalizedComponents[component] > 0 && normalizedSize === 'UNSIZED') {
        throw new Error(`Вкажіть розмір для компонента "${FINISHED_COMPONENT_LABELS[component]}"`);
      }
    }

    const totalPieces = FINISHED_COMPONENTS.reduce(
      (acc, component) => acc + normalizedComponents[component],
      0
    );

    if (totalPieces === 0) {
      throw new Error('Кількість виробів не може бути нульовою');
    }

    const previousSets = existing.sets ?? computeTotalSets(previousComponents);
    const requestedSets = Number.isFinite(sets) ? Math.max(0, Math.floor(Number(sets))) : 0;
    const inferredSets = computeTotalSets(normalizedComponents);
    const nextSets = requestedSets > 0 ? requestedSets : inferredSets;

    if (nextSets <= 0) {
      throw new Error('Кількість комплектів має бути більшою за нуль');
    }

    const producedTimestamp = (() => {
      if (producedAt && producedAt.trim().length > 0) {
        const parsed = new Date(producedAt);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }
      const fallback = new Date(existing.produced_at);
      return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
    })();

    const normalizedNote = (() => {
      if (note === undefined) {
        return existing.note;
      }
      const trimmed = note.trim();
      return trimmed.length > 0 ? trimmed : null;
    })();

    const setsDelta = nextSets - previousSets;
    const skipMaterials = existing.skip_materials === 1;

    const transaction = db.transaction(() => {
      let previousUnderwireUsage: UnderwireUsage | null = null;
      let nextUnderwireUsage: UnderwireUsage | null = null;

      if (!skipMaterials) {
        const materials = db
          .prepare(
            `SELECT pm.material_id, pm.quantity, m.quantity as available_quantity, m.name as material_name
               FROM product_materials pm
               JOIN materials m ON m.id = pm.material_id
              WHERE pm.product_id = ?`
          )
          .all(productId) as Array<{
            material_id: number;
            quantity: number;
            available_quantity: number;
            material_name: string;
          }>;

        if (setsDelta > 0) {
          for (const material of materials) {
            const requiredIncrease = Number(material.quantity) * setsDelta;
            const available = Number(material.available_quantity);
            if (requiredIncrease > 0 && available < requiredIncrease) {
              throw new Error(
                `Недостатньо матеріалу "${material.material_name}". Доступно ${available.toFixed(
                  2
                )}, потрібно ${requiredIncrease.toFixed(2)}`
              );
            }
          }
        }

        if (previousComponents.bra > 0) {
          previousUnderwireUsage = computeUnderwireUsage(db, previousComponentSizes.bra, previousComponents.bra);
        }

        if (normalizedComponents.bra > 0) {
          nextUnderwireUsage = computeUnderwireUsage(db, normalizedComponentSizes.bra, normalizedComponents.bra);
        }

        if (nextUnderwireUsage) {
          let available = nextUnderwireUsage.available;
          if (previousUnderwireUsage && previousUnderwireUsage.materialId === nextUnderwireUsage.materialId) {
            available += previousUnderwireUsage.required;
          }
          if (available < nextUnderwireUsage.required) {
            throw new Error(
              `Недостатньо косточок для розміру ${nextUnderwireUsage.size}. Доступно ${available.toFixed(2)}, потрібно ${nextUnderwireUsage.required.toFixed(2)}`
            );
          }
        }

        if (setsDelta !== 0) {
          for (const material of materials) {
            const delta = Number(material.quantity) * setsDelta;
            if (delta !== 0) {
              db.prepare('UPDATE materials SET quantity = quantity - ? WHERE id = ?').run(delta, material.material_id);
            }
          }
        }

        if (previousUnderwireUsage && previousUnderwireUsage.required > 0) {
          db.prepare('UPDATE materials SET quantity = quantity + ? WHERE id = ?').run(
            previousUnderwireUsage.required,
            previousUnderwireUsage.materialId
          );
        }

        if (nextUnderwireUsage && nextUnderwireUsage.required > 0) {
          db.prepare('UPDATE materials SET quantity = quantity - ? WHERE id = ?').run(
            nextUnderwireUsage.required,
            nextUnderwireUsage.materialId
          );
        }
      }

      for (const component of FINISHED_COMPONENTS) {
        const previousQuantity = previousComponents[component];
        if (previousQuantity > 0) {
          applyFinishedInventoryDelta(
            db,
            productId,
            component,
            previousComponentSizes[component],
            -previousQuantity
          );
        }
      }

      for (const component of FINISHED_COMPONENTS) {
        const nextQuantity = normalizedComponents[component];
        if (nextQuantity > 0) {
          applyFinishedInventoryDelta(
            db,
            productId,
            component,
            normalizedComponentSizes[component],
            nextQuantity
          );
        }
      }

      const sizeSummary =
        [
          normalizedComponentSizes.bra,
          normalizedComponentSizes.panties,
          normalizedComponentSizes.belt,
          normalizedComponentSizes.garter
        ].find((value) => value !== 'UNSIZED') ?? 'UNSIZED';

      db.prepare(
        `UPDATE finished_batches
            SET size = @size,
                bra_size = @braSize,
                panties_size = @pantiesSize,
                belt_size = @beltSize,
                garter_size = @garterSize,
                sets = @sets,
                bra = @bra,
                panties = @panties,
                belt = @belt,
                garter = @garter,
                note = @note,
                produced_at = @producedAt
          WHERE id = @id`
      ).run({
        id: existing.id,
        size: sizeSummary,
        braSize: normalizedComponentSizes.bra,
        pantiesSize: normalizedComponentSizes.panties,
        beltSize: normalizedComponentSizes.belt,
        garterSize: normalizedComponentSizes.garter,
        sets: nextSets,
        bra: normalizedComponents.bra,
        panties: normalizedComponents.panties,
        belt: normalizedComponents.belt,
        garter: normalizedComponents.garter,
        note: normalizedNote,
        producedAt: producedTimestamp.toISOString()
      });
    });

    transaction();

    return { success: true };
  });

  ipcMain.handle('finished:delete', (_event, batchId: number) => {
    if (!batchId) {
      throw new Error('Не вдалося визначити партію для видалення');
    }

    const existing = db
      .prepare('SELECT * FROM finished_batches WHERE id = ?')
      .get(batchId) as FinishedBatchRecord | undefined;

    if (!existing) {
      throw new Error('Партію не знайдено');
    }

    const productId = existing.product_id;
    const previousComponents: Record<FinishedComponent, number> = {
      bra: existing.bra,
      panties: existing.panties,
      belt: existing.belt,
      garter: existing.garter
    };
    const previousComponentSizes: Record<FinishedComponent, string> = {
      bra: normalizeFinishedSize(existing.bra_size || existing.size),
      panties: normalizeFinishedSize(existing.panties_size || existing.size),
      belt: normalizeFinishedSize(existing.belt_size || existing.size),
      garter: normalizeFinishedSize(existing.garter_size || existing.size)
    };

    const previousSets = existing.sets ?? computeTotalSets(previousComponents);
    const skipMaterials = existing.skip_materials === 1;

    const previousUnderwireUsage =
      !skipMaterials && previousComponents.bra > 0
        ? computeUnderwireUsage(db, previousComponentSizes.bra, previousComponents.bra)
        : null;

    const materials = !skipMaterials
      ? (db
          .prepare(
            `SELECT pm.material_id, pm.quantity
               FROM product_materials pm
              WHERE pm.product_id = ?`
          )
          .all(productId) as Array<{ material_id: number; quantity: number }>)
      : [];

    const transaction = db.transaction(() => {
      if (!skipMaterials && previousSets > 0) {
        for (const material of materials) {
          const delta = Number(material.quantity) * previousSets;
          if (delta !== 0) {
            db.prepare('UPDATE materials SET quantity = quantity + ? WHERE id = ?').run(delta, material.material_id);
          }
        }
      }

      if (previousUnderwireUsage && previousUnderwireUsage.required > 0) {
        db.prepare('UPDATE materials SET quantity = quantity + ? WHERE id = ?').run(
          previousUnderwireUsage.required,
          previousUnderwireUsage.materialId
        );
      }

      for (const component of FINISHED_COMPONENTS) {
        const quantity = previousComponents[component];
        if (quantity > 0) {
          applyFinishedInventoryDelta(
            db,
            productId,
            component,
            previousComponentSizes[component],
            -quantity
          );
        }
      }

      db.prepare('DELETE FROM finished_batches WHERE id = ?').run(existing.id);
    });

    transaction();

    return { success: true };
  });

  ipcMain.handle('finished:history', () => {
    const rows = db
      .prepare(
        `SELECT fb.*, p.name as product_name
           FROM finished_batches fb
           JOIN products p ON p.id = fb.product_id
          ORDER BY datetime(fb.produced_at) DESC
          LIMIT 200`
      )
      .all() as Array<FinishedBatchRecord & { product_name: string }>;

    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      size: normalizeFinishedSize(row.size),
      componentSizes: {
        bra: normalizeFinishedSize(row.bra_size || row.size),
        panties: normalizeFinishedSize(row.panties_size || row.size),
        belt: normalizeFinishedSize(row.belt_size || row.size),
        garter: normalizeFinishedSize(row.garter_size || row.size)
      },
      sets: row.sets,
      components: {
        bra: row.bra,
        panties: row.panties,
        belt: row.belt,
        garter: row.garter
      },
      note: row.note,
      producedAt: row.produced_at,
      skipMaterials: row.skip_materials === 1
    }));
  });

  ipcMain.handle('finished:sizeStats', () => {
    const rows = db
      .prepare(
        `SELECT p.id as product_id, p.name as product_name, ofa.component, ofa.size, SUM(ofa.quantity) as sold
           FROM order_finished_allocations ofa
           JOIN order_items oi ON oi.id = ofa.order_item_id
           JOIN orders o ON o.id = oi.order_id
           JOIN products p ON p.id = oi.product_id
          WHERE o.status = 'completed'
          GROUP BY p.id, p.name, ofa.component, ofa.size
          ORDER BY sold DESC`
      )
      .all() as Array<{ product_id: number; product_name: string; component: string; size: string; sold: number }>;

    return rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      component: ensureFinishedComponent(row.component),
      size: normalizeFinishedSize(row.size),
      sold: row.sold ?? 0
    }));
  });

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
      let productionCost = expenses.reduce((total, expense) => total + expense.amount, 0);

      if (expenses.length === 0) {
        const legacyExpenses = [{ label: 'Пошив', amount: product.sewing_cost }].filter(
          (entry) => (entry.amount ?? 0) > 0
        );
        if (legacyExpenses.length > 0) {
          expenses = legacyExpenses.map((entry) => ({ ...entry }));
          productionCost = legacyExpenses.reduce((total, entry) => total + entry.amount, 0);
        }
      }

      const discountAmount = calculateDiscount(product.discount_type, product.discount_value, product.sale_price);
      const effectiveSalePrice = Math.max(0, product.sale_price - discountAmount);
      const costPrice = materialsCost + productionCost;
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
        productionExpenses: expenses,
        productionCost,
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
      productionExpenses,
      photosToKeep = [],
      newPhotos = []
    } = payload as {
      id?: number;
      name: string;
      description?: string;
      materials: Array<{ id: number; quantity: number; pricePerUnit: number }>;
      salePrice: number;
      discount?: { type: 'none' | 'percent' | 'fixed'; value: number };
      productionExpenses: Array<{ label: string; amount: number }>;
      photosToKeep?: number[];
      newPhotos?: Array<{ originalName: string; filePath: string }>;
    };

    ensurePhotosDirectory();

    const normalizedMaterials = (materials ?? []).filter((item) => item.id && item.quantity > 0);
    const normalizedExpenses = (productionExpenses ?? []).filter((expense) => expense.label?.trim());
    const materialsCost = normalizedMaterials.reduce(
      (acc, item) => acc + (Number(item.pricePerUnit) || 0) * (Number(item.quantity) || 0),
      0
    );
    const productionCost = normalizedExpenses.reduce((acc, expense) => acc + (Number(expense.amount) || 0), 0);
    const discountType = discount?.type ?? 'none';
    const discountValue = Number(discount?.value ?? 0);
    const costPrice = materialsCost + productionCost;
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
           additional_cost=@productionCost,
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
        productionCost,
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
          @productionCost,
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
        productionCost,
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
      productionCost,
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

  ipcMain.handle('products:duplicate', (_event, productId: number) => {
    ensurePhotosDirectory();

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as ProductRecord | undefined;
    if (!product) {
      throw new Error('Товар не знайдено для дублювання');
    }

    const materials = db
      .prepare('SELECT material_id, quantity FROM product_materials WHERE product_id = ?')
      .all(productId) as Array<{ material_id: number; quantity: number }>;
    const expenses = db
      .prepare('SELECT label, amount FROM product_expenses WHERE product_id = ? ORDER BY id')
      .all(productId) as Array<{ label: string; amount: number }>;
    const photos = db
      .prepare('SELECT file_path FROM product_photos WHERE product_id = ? ORDER BY id')
      .all(productId) as Array<{ file_path: string }>;

    const trimmedName = product.name?.trim() ?? '';
    const baseName = trimmedName.length > 0 ? trimmedName : 'Товар';
    let candidateName = `${baseName} (копія)`;
    let suffix = 2;
    const nameCheck = db.prepare('SELECT COUNT(1) as count FROM products WHERE name = ?');
    while ((nameCheck.get(candidateName) as { count: number }).count > 0) {
      candidateName = `${baseName} (копія ${suffix})`;
      suffix += 1;
    }

    const insertProduct = db.prepare(
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
         @materials_cost,
         @additional_cost,
         @cost_price,
         @sewing_cost,
         @packaging_cost,
         @shipping_cost,
         @advertising_cost,
         @sale_price,
         @discount_type,
         @discount_value,
         @profit
       )`
    );

    const result = insertProduct.run({
      name: candidateName,
      description: product.description,
      materials_cost: product.materials_cost,
      additional_cost: product.additional_cost,
      cost_price: product.cost_price,
      sewing_cost: product.sewing_cost,
      packaging_cost: product.packaging_cost,
      shipping_cost: product.shipping_cost,
      advertising_cost: product.advertising_cost,
      sale_price: product.sale_price,
      discount_type: product.discount_type,
      discount_value: product.discount_value,
      profit: product.profit
    });

    const newProductId = Number(result.lastInsertRowid);

    const insertMaterial = db.prepare(
      'INSERT INTO product_materials (product_id, material_id, quantity) VALUES (?, ?, ?)' as const
    );
    const insertMaterialsTxn = db.transaction((rows: typeof materials) => {
      for (const row of rows) {
        insertMaterial.run(newProductId, row.material_id, row.quantity);
      }
    });
    insertMaterialsTxn(materials);

    const insertExpense = db.prepare(
      'INSERT INTO product_expenses (product_id, label, amount) VALUES (?, ?, ?)' as const
    );
    const insertExpensesTxn = db.transaction((rows: typeof expenses) => {
      for (const row of rows) {
        insertExpense.run(newProductId, row.label, row.amount);
      }
    });
    insertExpensesTxn(expenses);

    const insertPhoto = db.prepare('INSERT INTO product_photos (product_id, file_path) VALUES (?, ?)');
    for (const photo of photos) {
      const source = resolvePhotoPath(photo.file_path);
      if (!source || !fs.existsSync(source)) {
        continue;
      }
      const destinationRelative = generatePhotoRelativePath(path.basename(photo.file_path) || 'photo');
      const destinationAbsolute = path.join(app.getPath('userData'), destinationRelative);
      try {
        fs.copyFileSync(source, destinationAbsolute);
        insertPhoto.run(newProductId, destinationRelative);
      } catch (error) {
        console.error('Не вдалося дублювати фото товару', error);
      }
    }

    return { id: newProductId };
  });

  ipcMain.handle('orders:list', () => {
    const orders = db.prepare('SELECT * FROM orders ORDER BY datetime(created_at) DESC').all() as OrderRecord[];
    const itemsStmt = db.prepare(
      'SELECT oi.*, p.name as product_name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE order_id = ?'
    );
    const allocationsStmt = db.prepare(
      'SELECT component, size, quantity FROM order_finished_allocations WHERE order_item_id = ?'
    );
    const expensesStmt = db.prepare('SELECT id, label, amount FROM order_expenses WHERE order_id = ? ORDER BY id');

    return orders.map((order) => ({
      ...order,
      items: itemsStmt.all(order.id).map((row: any) => ({
        id: row.product_id,
        name: row.product_name,
        quantity: row.quantity,
        price: row.price,
        discount: row.discount,
        allocations: allocationsStmt
          .all(row.id)
          .map((allocation: any) => ({
            component: ensureFinishedComponent(allocation.component),
            size: normalizeFinishedSize(allocation.size),
            quantity: allocation.quantity
          }))
      })),
      expenses: expensesStmt.all(order.id) as Array<{ id: number; label: string; amount: number }>
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
      clientId: payloadClientId,
      orderDiscountPercent,
      expenses
    } = payload;

    const trimmedFirstName = (customerFirstName ?? '').trim();
    const trimmedLastName = (customerLastName ?? '').trim();
    const sanitizedInstagram = sanitizeInstagram(customerInstagram);
    const normalizedPhone = normalizePhone(customerPhone);
    const normalizedBirthDate =
      typeof customerBirthDate === 'string' && customerBirthDate.length > 0 ? customerBirthDate : null;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Додайте хоча б один товар до замовлення');
    }

    const inventoryTotalsCache = new Map<number, Record<FinishedComponent, number>>();
    const getInventoryTotals = (productId: number) => {
      if (inventoryTotalsCache.has(productId)) {
        return inventoryTotalsCache.get(productId)!;
      }
      const rows = db
        .prepare('SELECT component, SUM(quantity) as total FROM finished_inventory WHERE product_id = ? GROUP BY component')
        .all(productId) as Array<{ component: string; total: number | null }>;
      const totals: Record<FinishedComponent, number> = { bra: 0, panties: 0, belt: 0, garter: 0 };
      for (const row of rows) {
        const component = ensureFinishedComponent(row.component);
        totals[component] = Number(row.total) || 0;
      }
      inventoryTotalsCache.set(productId, totals);
      return totals;
    };

    const normalizedItems = items.map((item: any, index: number) => {
      const productId = Number(item.productId);
      if (!Number.isInteger(productId) || productId <= 0) {
        throw new Error(`Некоректний товар у позиції ${index + 1}`);
      }
      const quantity = Math.max(0, Math.floor(Number(item.quantity)));
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Кількість у позиції ${index + 1} повинна бути більшою за 0`);
      }
      const price = Number(item.price) || 0;
      const discount = Number(item.discount) || 0;
      const allocationPayloads: AllocationPayload[] = (Array.isArray(item.allocations) ? item.allocations : []).map(
        (allocation: any) => {
          if (!allocation?.size || !allocation.size.trim()) {
            throw new Error('Оберіть розмір для кожного елементу комплекту');
          }
          const component = allocation.component;
          const quantityValue = Math.max(0, Math.floor(Number(allocation.quantity)));
          if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
            throw new Error('Кількість готових виробів повинна бути більшою за 0');
          }
          return {
            component,
            size: allocation.size,
            quantity: quantityValue
          };
        }
      );

      const grouped = groupAllocationsByComponent(allocationPayloads);

      const inventoryTotals = getInventoryTotals(productId);
      const requiredComponents = FINISHED_COMPONENTS.filter(
        (component) => (inventoryTotals[component] ?? 0) > 0 || grouped[component].total > 0
      );

      if (requiredComponents.length > 0 && allocationPayloads.length === 0) {
        throw new Error('Розподіліть готові вироби для кожного товару');
      }

      for (const component of requiredComponents) {
        const total = grouped[component].total;
        if (total !== quantity) {
          throw new Error(
            `Для ${FINISHED_COMPONENT_LABELS[component]} потрібно розподілити ${quantity} од. (зараз ${total})`
          );
        }
        for (const sizeKey of Object.keys(grouped[component].bySize)) {
          if (sizeKey === 'UNSIZED') {
            throw new Error('Оберіть розмір для кожного елементу комплекту');
          }
        }
      }

      return {
        productId,
        quantity,
        price,
        discount,
        allocations: grouped
      };
    });

    const subtotal = normalizedItems.reduce(
      (acc: number, item) => acc + (item.price - item.discount) * item.quantity,
      0
    );

    const normalizedExpenses = (Array.isArray(expenses) ? expenses : [])
      .map((expense: any, index: number) => {
        const label = typeof expense?.label === 'string' ? expense.label.trim() : '';
        const amount = Number(expense?.amount ?? 0);
        if (!label) {
          return null;
        }
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error(`Сума витрати №${index + 1} повинна бути невід'ємною`);
        }
        return { label, amount: Math.round(amount * 100) / 100 };
      })
      .filter((expense): expense is { label: string; amount: number } => expense !== null);

    const rawDiscountPercent = Number(orderDiscountPercent);
    const discountPercent = Number.isFinite(rawDiscountPercent)
      ? Math.min(100, Math.max(0, rawDiscountPercent))
      : 0;
    const rawDiscountAmount = Math.min(subtotal, (subtotal * discountPercent) / 100);
    const discountAmount = Math.round(rawDiscountAmount * 100) / 100;
    const totalAmount = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
    const expensesTotal = normalizedExpenses.reduce((sum, expense) => sum + expense.amount, 0);

    const execute = db.transaction(() => {
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

      const inventoryLookup = db.prepare(
        'SELECT quantity FROM finished_inventory WHERE product_id = ? AND component = ? AND size = ?'
      );
      const insertItemStmt = db.prepare(
        'INSERT INTO order_items (order_id, product_id, quantity, price, discount) VALUES (?, ?, ?, ?, ?)'
      );
      const insertAllocationStmt = db.prepare(
        'INSERT INTO order_finished_allocations (order_item_id, component, size, quantity) VALUES (?, ?, ?, ?)'
      );

      const ensureInventoryAvailability = () => {
        for (const item of normalizedItems) {
          for (const component of FINISHED_COMPONENTS) {
            const entries = Object.entries(item.allocations[component].bySize);
            for (const [sizeKey, amount] of entries) {
              if (amount <= 0) continue;
              const row = inventoryLookup.get(item.productId, component, sizeKey) as { quantity: number } | undefined;
              const available = row?.quantity ?? 0;
              if (available < amount) {
                throw new Error(
                  `Недостатньо готових виробів (${FINISHED_COMPONENT_LABELS[component]} ${sizeKey}) на складі`
                );
              }
            }
          }
        }
      };

      let orderId = id ?? null;

      if (orderId) {
        restoreFinishedInventoryForOrder(db, orderId);
        ensureInventoryAvailability();
        db.prepare(
          `UPDATE orders SET order_number=@orderNumber, customer_first_name=@customerFirstName, customer_last_name=@customerLastName,
             customer_instagram=@customerInstagram, customer_phone=@customerPhone, customer_birth_date=@customerBirthDate,
             client_id=@clientId, delivery_address=@deliveryAddress, discount_percent=@discountPercent, total_amount=@totalAmount,
             status=@status WHERE id=@id`
        ).run({
          id: orderId,
          orderNumber,
          customerFirstName: trimmedFirstName,
          customerLastName: trimmedLastName,
          customerInstagram: sanitizedInstagram ?? null,
          customerPhone: normalizedPhone ?? null,
          customerBirthDate: normalizedBirthDate,
          clientId,
          deliveryAddress,
          discountPercent,
          totalAmount,
          status
        });
        db.prepare('DELETE FROM order_expenses WHERE order_id = ?').run(orderId);
        db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
      } else {
        ensureInventoryAvailability();
        const insert = db.prepare(
          `INSERT INTO orders (order_number, customer_first_name, customer_last_name, customer_instagram, customer_phone, customer_birth_date, client_id, delivery_address, discount_percent, total_amount, status)
           VALUES (@orderNumber, @customerFirstName, @customerLastName, @customerInstagram, @customerPhone, @customerBirthDate, @clientId, @deliveryAddress, @discountPercent, @totalAmount, @status)`
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
          discountPercent,
          totalAmount,
          status
        });
        orderId = Number(result.lastInsertRowid);
      }

      if (!orderId) {
        throw new Error('Не вдалося зберегти замовлення');
      }

      for (const item of normalizedItems) {
        const inserted = insertItemStmt.run(orderId, item.productId, item.quantity, item.price, item.discount);
        const orderItemId = Number(inserted.lastInsertRowid);
        for (const component of FINISHED_COMPONENTS) {
          const entries = Object.entries(item.allocations[component].bySize);
          for (const [sizeKey, amount] of entries) {
            if (amount <= 0) continue;
            applyFinishedInventoryDelta(db, item.productId, component, sizeKey, -amount);
            insertAllocationStmt.run(orderItemId, component, sizeKey, amount);
          }
        }
      }

      const insertExpenseStmt = db.prepare('INSERT INTO order_expenses (order_id, label, amount) VALUES (?, ?, ?)');
      for (const expense of normalizedExpenses) {
        insertExpenseStmt.run(orderId, expense.label, expense.amount);
      }

      return { id: orderId, totalAmount, discountPercent, discountAmount, expensesTotal };
    });

    return execute();
  });
  ipcMain.handle('orders:delete', (_event, id: number) => {
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return { success: true };
    }
    const txn = db.transaction((targetId: number) => {
      restoreFinishedInventoryForOrder(db, targetId);
      db.prepare('DELETE FROM orders WHERE id = ?').run(targetId);
    });
    txn(orderId);
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
           SUM(additional_cost) as productionCost
         FROM products`
      )
      .get() as {
        materialsCost: number | null;
        productionCost: number | null;
      };

    const productionBreakdownRows = db
      .prepare(
        `SELECT label, SUM(amount) as total
         FROM product_expenses
         GROUP BY label
         ORDER BY total DESC`
      )
      .all() as Array<{ label: string; total: number }>;

    const orderExpenseRows = db
      .prepare(
        `SELECT label, SUM(amount) as total
         FROM order_expenses
         GROUP BY label
         ORDER BY total DESC`
      )
      .all() as Array<{ label: string; total: number }>;

    const productionBreakdown = productionBreakdownRows.map((row) => ({
      label: `Виробництво · ${row.label}`,
      value: row.total
    }));

    const orderExpenseBreakdown = orderExpenseRows.map((row) => ({
      label: `Продажі · ${row.label}`,
      value: row.total
    }));

    const productionSubtotal = productionBreakdownRows.reduce((sum, row) => sum + row.total, 0);
    const expenseBreakdown = [
      { label: 'Матеріали', value: expenseTotals.materialsCost ?? 0 },
      ...productionBreakdown,
      ...orderExpenseBreakdown
    ];

    if ((expenseTotals.productionCost ?? 0) > productionSubtotal) {
      expenseBreakdown.push({
        label: 'Виробництво · Інше',
        value: (expenseTotals.productionCost ?? 0) - productionSubtotal
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
