/* app.js — perakitan Express. Tidak pernah dimuat browser (server-only). */

import express from 'express';
import { devAuth } from './middleware/dev-auth.js';
import { asyncHandler } from './middleware/async-handler.js';
import { authRouter } from './routes/auth.routes.js';
import { inspectionsRouter } from './routes/inspections.routes.js';
import { schedulesRouter } from './routes/schedules.routes.js';
import { plantsRouter } from './routes/plants.routes.js';
import { usersRouter } from './routes/users.routes.js';

export const app = express();

app.use(express.json());
app.use('/api', asyncHandler(devAuth));

app.use('/api/auth', authRouter);
app.use('/api/inspections', inspectionsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/plants', plantsRouter);
app.use('/api/users', usersRouter);

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
});
