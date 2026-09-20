/* main.js — satu-satunya entry point aplikasi.

   Mengevaluasi legacy-app.js sudah cukup: efek sampingnya memasang seluruh
   event listener (termasuk pendaftaran aksi klik lewat action-dispatcher.js).
   Sejak Phase 9 tidak ada lagi atribut onclick="..." yang butuh fungsi di
   scope global, sehingga jembatan window (src/compat/global-bridge.js,
   dipakai Phase 2-8) sudah dihapus. */

import './legacy-app.js';
