/* main.js — satu-satunya entry point aplikasi.

   Urutan penting: legacy-app.js dievaluasi lebih dulu (efek sampingnya
   memasang seluruh event listener), baru jembatan global dipasang. */

import * as legacyApp from './legacy-app.js';
import { installGlobalBridge } from './compat/global-bridge.js';

installGlobalBridge(legacyApp);
