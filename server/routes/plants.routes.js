/* plants.routes.js — Phase 12: hanya baca. CRUD admin untuk plant (lihat
 * docs/ROADMAP-PHASE12.md) ditunda sampai ada UI admin sungguhan yang
 * memakainya — plant adalah data referensi yang jarang berubah.
 */

import { Router } from 'express';
import * as plantRepository from '../repositories/plant-repository.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const plantsRouter = Router();

plantsRouter.get('/', asyncHandler(async (req, res) => {
    res.json(await plantRepository.getAll());
}));
