/* app.js — perakitan Express. Tidak pernah dimuat browser (server-only).
 *
 * Phase 13: /api/auth (login/logout/me) dipasang SEBELUM sessionAuth/
 * requireCsrf blanket, supaya login bisa diakses tanpa sesi. Router lain
 * (inspections/schedules/plants/users) dipasang SESUDAHNYA, jadi otomatis
 * butuh sesi valid + (untuk POST/PUT/DELETE) header X-CSRF-Token yang benar.
 */

import express from 'express';
import session from 'express-session';
import { sessionStore } from './db/session-store.js';
import { sessionAuth } from './middleware/session-auth.js';
import { requireCsrf } from './middleware/csrf.js';
import { asyncHandler } from './middleware/async-handler.js';
import { authRouter } from './routes/auth.routes.js';
import { inspectionsRouter } from './routes/inspections.routes.js';
import { schedulesRouter } from './routes/schedules.routes.js';
import { plantsRouter } from './routes/plants.routes.js';
import { usersRouter } from './routes/users.routes.js';

export const app = express();

app.use(express.json());

app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    name: 'she_sasa.sid',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 8, // 8 jam
    },
}));

app.use('/api/auth', authRouter);

app.use('/api', asyncHandler(sessionAuth), requireCsrf);

app.use('/api/inspections', inspectionsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/plants', plantsRouter);
app.use('/api/users', usersRouter);

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
});
