/**
 * ============================================================================
 * KONFIGURASI SUPABASE
 * Ganti SUPABASE_URL dan SUPABASE_ANON_KEY dengan kredensial proyek Anda.
 * ============================================================================
 */
const SUPABASE_URL = 'https://hpkdhmnpjwvljllvvyew.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_QtgYnR4GYItoMmicjt26pQ_EFCzzohz';

const BUCKET_PRODUK = 'produk-images';

// Inisialisasi Client Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * ============================================================================
 * STATE GLOBAL APLIKASI
 * ============================================================================
 */
const state = {
    pengaturan: {
        nama_toko: 'GARASI BAKO & TINGWE',
        slogan: 'Spesialis Tembakau Nusantara & Flavour Premium',
        alamat: 'Jl. Veteran No. 45, Kota Bandung',
        no_telepon: '081234567890',
        catatan_struk: 'Terima kasih telah berbelanja!'
    },
    kategoriList: [],
    produkList: [],
    riwayatStokList: [],
    transaksiList: [],
    cart: [],
    posActiveKategori: 'ALL',
    katalogActiveKategori: 'ALL',
    compressedImageBlob: null,
    lastStrukData: null,
    dataTables: {
        produk: null,
        riwayatStok: null,
        laporan: null
    }
};

/**
 * ============================================================================
 * FUNGSI UTILITAS & FORMATTER
 * ============================================================================
 */
function formatRupiah(angka) {
    const num = Number(angka) || 0;
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num);
}

function formatAngkaBiasa(angka) {
    const num = Number(angka) || 0;
    return new Intl.NumberFormat('id-ID').format(num);
}

function formatTanggalWaktu(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return d.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showLoading(text = 'Memuat data...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.remove('d-none');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('d-none');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * ============================================================================
 * KOMPRESI GAMBAR CLIENT-SIDE (HTML5 CANVAS - MAKS 800PX, JPEG 70%)
 * ============================================================================
 */
function compressImageClientSide(file, maxDimension = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxDimension) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    }
                } else {
                    if (height > maxDimension) {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Gagal melakukan kompresi gambar.'));
                            return;
                        }
                        resolve({
                            blob,
                            width,
                            height,
                            previewUrl: URL.createObjectURL(blob)
                        });
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

/**
 * ============================================================================
 * INISIALISASI APLIKASI & NAVIGASI SPA
 * ============================================================================
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Tampilkan Tanggal Hari Ini di Topbar
    const now = new Date();
    document.getElementById('currentDateDisplay').textContent = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    // Set Default Tanggal Filter Laporan (Awal Bulan s/d Hari Ini)
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    document.getElementById('filterTanggalMulai').value = firstDay.toISOString().split('T')[0];
    document.getElementById('filterTanggalAkhir').value = now.toISOString().split('T')[0];

    initSpaNavigation();
    initEventListeners();
    await loadAllInitialData();
});

function initSpaNavigation() {
    const navLinks = document.querySelectorAll('.nav-item-link');
    const sections = document.querySelectorAll('.spa-section');
    const pageTitle = document.getElementById('pageTitle');
    const sidebar = document.getElementById('sidebar');

    const titleMap = {
        'sec-dashboard': 'Dashboard Ringkasan',
        'sec-pos': 'Kasir Point of Sale (POS)',
        'sec-produk': 'Data Produk & Inventori',
        'sec-stok': 'Riwayat Stok (Restock & Opname)',
        'sec-laporan': 'Laporan Transaksi Penjualan',
        'sec-katalog': 'Katalog Publik (Mode Pelanggan)',
        'sec-pengaturan': 'Pengaturan Identitas Toko'
    };

    navLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');

            navLinks.forEach((l) => l.classList.remove('active'));
            link.classList.add('active');

            sections.forEach((sec) => {
                sec.classList.toggle('active', sec.id === targetId);
            });

            pageTitle.textContent = titleMap[targetId] || 'Sistem POS Tembakau';
            sidebar.classList.remove('show');

            // Redraw DataTables saat tab dibuka agar lebar kolom rapi
            if (targetId === 'sec-produk' && state.dataTables.produk) {
                state.dataTables.produk.columns.adjust();
            } else if (targetId === 'sec-stok' && state.dataTables.riwayatStok) {
                state.dataTables.riwayatStok.columns.adjust();
            } else if (targetId === 'sec-laporan' && state.dataTables.laporan) {
                state.dataTables.laporan.columns.adjust();
            }
        });
    });

    // Toggle Sidebar Mobile
    document.getElementById('btnToggleSidebar').addEventListener('click', () => {
        sidebar.classList.add('show');
    });
    document.getElementById('btnCloseSidebar').addEventListener('click', () => {
        sidebar.classList.remove('show');
    });

    // Pintasan Tombol "Buka Kasir" & "Buka Menu Restock"
    document.getElementById('btnQuickPos').addEventListener('click', () => {
        document.querySelector('.nav-item-link[data-target="sec-pos"]').click();
    });
    document.getElementById('btnKeRiwayatStok').addEventListener('click', () => {
        document.querySelector('.nav-item-link[data-target="sec-stok"]').click();
    });
}

/**
 * ============================================================================
 * PEMUATAN DATA DARI SUPABASE
 * ============================================================================
 */
async function loadAllInitialData() {
    const statusBadge = document.getElementById('dbStatusBadge');
    if (SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
        statusBadge.className = 'badge bg-warning text-dark';
        statusBadge.textContent = 'Belum Dikonfigurasi';
        Swal.fire({
            icon: 'warning',
            title: 'Kredensial Supabase Belum Diisi',
            html: 'Silakan buka file <code>app.js</code> dan isi konstanta <b>SUPABASE_URL</b> serta <b>SUPABASE_ANON_KEY</b> dengan kredensial proyek Supabase Anda.',
            confirmButtonColor: '#D4AF37'
        });
        return;
    }

    showLoading('Menghubungkan ke database Supabase...');
    try {
        await Promise.all([
            fetchPengaturanToko(),
            fetchKategori(),
            fetchProduk(),
            fetchRiwayatStok(),
            fetchTransaksiLaporan()
        ]);

        statusBadge.className = 'badge bg-success';
        statusBadge.textContent = 'Terhubung';

        renderDashboard();
        renderPosCategoryPills();
        renderPosProducts();
        renderCart();
        renderKatalogPublik();
    } catch (error) {
        console.error('Error memuat data:', error);
        statusBadge.className = 'badge bg-danger';
        statusBadge.textContent = 'Error Koneksi';
        Swal.fire('Gagal Memuat Data', error.message || 'Periksa koneksi atau konfigurasi RLS Supabase Anda.', 'error');
    } finally {
        hideLoading();
    }
}

async function fetchPengaturanToko() {
    const { data, error } = await supabaseClient
        .from('pengaturan_toko')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

    if (error) throw error;
    if (data) {
        state.pengaturan = data;
    }

    // Update elemen UI
    document.getElementById('sidebarNamaToko').textContent = state.pengaturan.nama_toko;
    document.getElementById('katalogNamaToko').textContent = state.pengaturan.nama_toko;
    document.getElementById('katalogSlogan').textContent = state.pengaturan.slogan || '';

    document.getElementById('setNamaToko').value = state.pengaturan.nama_toko || '';
    document.getElementById('setSlogan').value = state.pengaturan.slogan || '';
    document.getElementById('setAlamat').value = state.pengaturan.alamat || '';
    document.getElementById('setNoTelepon').value = state.pengaturan.no_telepon || '';
    document.getElementById('setCatatanStruk').value = state.pengaturan.catatan_struk || '';
}

async function fetchKategori() {
    const { data, error } = await supabaseClient
        .from('kategori')
        .select('*')
        .order('id', { ascending: true });

    if (error) throw error;
    state.kategoriList = data || [];

    // Populate Dropdown Kategori di Modal Produk
    const selectKategori = document.getElementById('prodKategoriId');
    selectKategori.innerHTML = state.kategoriList
        .map((k) => `<option value="${k.id}">${escapeHtml(k.nama_kategori)}</option>`)
        .join('');

    // Populate List Kategori di Pengaturan
    const listKategori = document.getElementById('listKategoriPengaturan');
    listKategori.innerHTML = state.kategoriList
        .map((k) => `
            <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                <span class="fw-medium"><i class="fa-solid fa-tag text-gold me-2"></i>${escapeHtml(k.nama_kategori)}</span>
                <span class="badge bg-light text-secondary border">ID: ${k.id}</span>
            </li>
        `)
        .join('');
}

async function fetchProduk() {
    const { data, error } = await supabaseClient
        .from('produk')
        .select('*, kategori(nama_kategori)')
        .order('nama_produk', { ascending: true });

    if (error) throw error;
    state.produkList = data || [];

    renderTabelProduk();
    populateDropdownProdukStok();
}

async function fetchRiwayatStok() {
    const { data, error } = await supabaseClient
        .from('riwayat_stok')
        .select('*, produk(kode_produk, nama_produk, satuan)')
        .order('created_at', { ascending: false })
        .limit(300);

    if (error) throw error;
    state.riwayatStokList = data || [];
    renderTabelRiwayatStok();
}

async function fetchTransaksiLaporan() {
    const tglMulai = document.getElementById('filterTanggalMulai').value;
    const tglAkhir = document.getElementById('filterTanggalAkhir').value;

    let query = supabaseClient
        .from('transaksi')
        .select('*, transaksi_detail(*)')
        .order('tanggal', { ascending: false });

    if (tglMulai) {
        query = query.gte('tanggal', `${tglMulai}T00:00:00`);
    }
    if (tglAkhir) {
        query = query.lte('tanggal', `${tglAkhir}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) throw error;
    state.transaksiList = data || [];

    renderTabelLaporan();
}

/**
 * ============================================================================
 * 1. RENDER MODUL DASHBOARD
 * ============================================================================
 */
function renderDashboard() {
    // Hitung Transaksi Hari Ini (Waktu Lokal)
    const todayStr = new Date().toLocaleDateString('id-ID');

    const transaksiHariIni = state.transaksiList.filter((t) => {
        const tglNota = new Date(t.tanggal).toLocaleDateString('id-ID');
        return tglNota === todayStr;
    });

    const omzetHariIni = transaksiHariIni.reduce((sum, t) => sum + Number(t.total_akhir || 0), 0);
    const labaHariIni = transaksiHariIni.reduce((sum, t) => sum + Number(t.laba_kotor || 0), 0);
    const totalNotaHariIni = transaksiHariIni.length;

    // Produk Stok Menipis (stok_saat_ini <= batas_stok_minimum)
    const produkMenipis = state.produkList.filter(
        (p) => Number(p.stok_saat_ini) <= Number(p.batas_stok_minimum)
    );

    document.getElementById('statOmzetHariIni').textContent = formatRupiah(omzetHariIni);
    document.getElementById('statLabaHariIni').textContent = formatRupiah(labaHariIni);
    document.getElementById('statTransaksiHariIni').textContent = `${totalNotaHariIni} Nota`;
    document.getElementById('statStokMenipis').textContent = `${produkMenipis.length} Produk`;

    // Tabel Stok Menipis
    const tbody = document.getElementById('tbodyStokMenipis');
    if (produkMenipis.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-4 text-muted">
                    <i class="fa-solid fa-circle-check text-success fs-4 d-block mb-1"></i>
                    Seluruh stok produk berada di atas batas minimum aman.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = produkMenipis
        .map((p) => {
            const isHabis = Number(p.stok_saat_ini) <= 0;
            const statusBadge = isHabis
                ? '<span class="badge bg-danger">Stok Habis</span>'
                : '<span class="badge bg-warning text-dark">Stok Menipis</span>';

            return `
                <tr>
                    <td class="fw-semibold"><code>${escapeHtml(p.kode_produk)}</code></td>
                    <td class="fw-semibold text-espresso">${escapeHtml(p.nama_produk)}</td>
                    <td>${escapeHtml(p.kategori?.nama_kategori || '-')}</td>
                    <td class="text-center fw-bold ${isHabis ? 'text-danger' : 'text-warning-emphasis'}">${p.stok_saat_ini} ${escapeHtml(p.satuan)}</td>
                    <td class="text-center text-muted">${p.batas_stok_minimum} ${escapeHtml(p.satuan)}</td>
                    <td>${statusBadge}</td>
                    <td class="text-end">
                        <button class="btn btn-xs btn-gold fw-semibold" onclick="shortcutRestockProduk(${p.id})">
                            <i class="fa-solid fa-plus me-1"></i>Restock
                        </button>
                    </td>
                </tr>
            `;
        })
        .join('');
}

window.shortcutRestockProduk = function (produkId) {
    document.querySelector('.nav-item-link[data-target="sec-stok"]').click();
    const select = document.getElementById('stokProdukId');
    select.value = String(produkId);
    select.dispatchEvent(new Event('change'));
    document.getElementById('stokJumlah').focus();
};

/**
 * ============================================================================
 * 2. MODUL DATA PRODUK & INVENTORI (CRUD + UPLOAD STORAGE)
 * ============================================================================
 */
function renderTabelProduk() {
    if (state.dataTables.produk) {
        state.dataTables.produk.destroy();
    }

    const tbody = document.getElementById('tbodyProduk');
    tbody.innerHTML = state.produkList
        .map((p) => {
            const imgUrl = p.foto_url || 'https://placehold.co/80x80/2C221E/D4AF37?text=Bako';
            const isLow = Number(p.stok_saat_ini) <= Number(p.batas_stok_minimum);
            const stokBadgeClass = Number(p.stok_saat_ini) <= 0
                ? 'bg-danger'
                : isLow
                ? 'bg-warning text-dark'
                : 'bg-success-subtle text-success';

            return `
                <tr>
                    <td>
                        <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(p.nama_produk)}" class="rounded border" style="width: 48px; height: 48px; object-fit: cover;">
                    </td>
                    <td>
                        <div class="fw-bold text-espresso">${escapeHtml(p.nama_produk)}</div>
                        <small class="text-muted"><code>${escapeHtml(p.kode_produk)}</code> • ${escapeHtml(p.satuan)}</small>
                    </td>
                    <td><span class="badge bg-light text-dark border">${escapeHtml(p.kategori?.nama_kategori || '-')}</span></td>
                    <td class="text-end text-muted">${formatRupiah(p.harga_modal)}</td>
                    <td class="text-end fw-semibold">${formatRupiah(p.harga_ecer)}</td>
                    <td class="text-end">
                        <div class="fw-semibold text-espresso">${formatRupiah(p.harga_grosir)}</div>
                        <small class="text-muted">Min. ${p.min_grosir} ${escapeHtml(p.satuan)}</small>
                    </td>
                    <td class="text-center">
                        <span class="badge ${stokBadgeClass} fs-6">${p.stok_saat_ini}</span>
                    </td>
                    <td class="text-end text-nowrap">
                        <button class="btn btn-sm btn-outline-espresso me-1" onclick="openModalEditProduk(${p.id})" title="Edit Produk">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="hapusProduk(${p.id})" title="Hapus Produk">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        })
        .join('');

    state.dataTables.produk = $('#tableProduk').DataTable({
        pageLength: 10,
        language: {
            search: 'Cari Produk:',
            lengthMenu: 'Tampilkan _MENU_ data',
            info: 'Menampilkan _START_ - _END_ dari _TOTAL_ produk',
            zeroRecords: 'Produk tidak ditemukan',
            paginate: { previous: 'Sebelumnya', next: 'Berikutnya' }
        }
    });
}

function generateKodeProdukOtomatis() {
    const randomNum = Math.floor(100 + Math.random() * 900);
    const count = state.produkList.length + 1;
    return `TBK-${String(count).padStart(3, '0')}${randomNum}`;
}

window.openModalEditProduk = function (id) {
    const p = state.produkList.find((item) => item.id === id);
    if (!p) return;

    state.compressedImageBlob = null;
    document.getElementById('modalProdukTitle').textContent = 'Edit Data Produk';
    document.getElementById('prodId').value = p.id;
    document.getElementById('prodFotoUrlLama').value = p.foto_url || '';
    document.getElementById('prodKode').value = p.kode_produk;
    document.getElementById('prodNama').value = p.nama_produk;
    document.getElementById('prodKategoriId').value = p.kategori_id || '';
    document.getElementById('prodSatuan').value = p.satuan || 'Pouch';
    document.getElementById('prodHargaModal').value = p.harga_modal;
    document.getElementById('prodHargaEcer').value = p.harga_ecer;
    document.getElementById('prodHargaGrosir').value = p.harga_grosir;
    document.getElementById('prodMinGrosir').value = p.min_grosir;
    document.getElementById('prodStokSaatIni').value = p.stok_saat_ini;
    document.getElementById('prodBatasStokMin').value = p.batas_stok_minimum;
    document.getElementById('prodFotoInput').value = '';
    document.getElementById('prodFotoPreview').src = p.foto_url || 'https://placehold.co/100x100/2C221E/D4AF37?text=No+Image';
    document.getElementById('infoKompresiFoto').innerHTML = 'Biarkan kosong jika tidak ingin mengganti foto produk.';

    const modal = new bootstrap.Modal(document.getElementById('modalProduk'));
    modal.show();
};

window.hapusProduk = async function (id) {
    const p = state.produkList.find((item) => item.id === id);
    if (!p) return;

    const confirm = await Swal.fire({
        title: 'Hapus Produk?',
        html: `Anda yakin ingin menghapus <b>${escapeHtml(p.nama_produk)}</b> dari inventori?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    });

    if (!confirm.isConfirmed) return;

    showLoading('Menghapus produk...');
    try {
        const { error } = await supabaseClient.from('produk').delete().eq('id', id);
        if (error) throw error;

        await fetchProduk();
        renderDashboard();
        renderPosProducts();
        renderKatalogPublik();

        Swal.fire('Terhapus!', 'Produk berhasil dihapus dari database.', 'success');
    } catch (err) {
        Swal.fire('Gagal Menghapus', err.message, 'error');
    } finally {
        hideLoading();
    }
};

/**
 * ============================================================================
 * 3. MODUL RIWAYAT STOK (RESTOCK & STOCK OPNAME)
 * ============================================================================
 */
function populateDropdownProdukStok() {
    const select = document.getElementById('stokProdukId');
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Pilih Produk --</option>' +
        state.produkList
            .map((p) => `<option value="${p.id}">[${escapeHtml(p.kode_produk)}] ${escapeHtml(p.nama_produk)} (Stok: ${p.stok_saat_ini} ${escapeHtml(p.satuan)})</option>`)
            .join('');
    if (currentVal) select.value = currentVal;
}

function renderTabelRiwayatStok() {
    if (state.dataTables.riwayatStok) {
        state.dataTables.riwayatStok.destroy();
    }

    const tbody = document.getElementById('tbodyRiwayatStok');
    tbody.innerHTML = state.riwayatStokList
        .map((r) => {
            let badgeJenis = '';
            let tanda = '';
            if (r.jenis_perubahan === 'RESTOCK') {
                badgeJenis = '<span class="badge bg-success">RESTOCK MASUK</span>';
                tanda = '+';
            } else if (r.jenis_perubahan === 'OPNAME_KURANG') {
                badgeJenis = '<span class="badge bg-danger">OPNAME KURANG (SUSUT/RUSAK)</span>';
                tanda = '-';
            } else {
                badgeJenis = '<span class="badge bg-primary">OPNAME TAMBAH</span>';
                tanda = '+';
            }

            return `
                <tr>
                    <td class="small text-muted text-nowrap">${formatTanggalWaktu(r.created_at)}</td>
                    <td>
                        <div class="fw-semibold text-espresso">${escapeHtml(r.produk?.nama_produk || 'Produk Terhapus')}</div>
                        <small class="text-muted"><code>${escapeHtml(r.produk?.kode_produk || '-')}</code></small>
                    </td>
                    <td>${badgeJenis}</td>
                    <td class="text-center fw-bold">${tanda}${r.jumlah} ${escapeHtml(r.produk?.satuan || '')}</td>
                    <td class="text-center small">
                        <span class="text-muted">${r.stok_sebelum}</span>
                        <i class="fa-solid fa-arrow-right mx-1 text-gold"></i>
                        <strong class="text-espresso">${r.stok_sesudah}</strong>
                    </td>
                    <td class="small">${escapeHtml(r.keterangan || '-')}</td>
                </tr>
            `;
        })
        .join('');

    state.dataTables.riwayatStok = $('#tableRiwayatStok').DataTable({
        pageLength: 10,
        order: [],
        language: {
            search: 'Cari Riwayat:',
            lengthMenu: '_MENU_ baris',
            info: 'Menampilkan _START_ - _END_ dari _TOTAL_ log',
            zeroRecords: 'Belum ada riwayat perubahan stok'
        }
    });
}

/**
 * ============================================================================
 * 4. MODUL KASIR (POINT OF SALE / POS)
 * ============================================================================
 */
function renderPosCategoryPills() {
    const container = document.getElementById('posCategoryFilter');
    const pills = [
        `<button type="button" class="category-pill ${state.posActiveKategori === 'ALL' ? 'active' : ''}" onclick="setPosKategori('ALL')">Semua Produk</button>`
    ];

    state.kategoriList.forEach((k) => {
        const isActive = String(state.posActiveKategori) === String(k.id);
        pills.push(
            `<button type="button" class="category-pill ${isActive ? 'active' : ''}" onclick="setPosKategori('${k.id}')">${escapeHtml(k.nama_kategori)}</button>`
        );
    });

    container.innerHTML = pills.join('');
}

window.setPosKategori = function (kategoriId) {
    state.posActiveKategori = kategoriId;
    renderPosCategoryPills();
    renderPosProducts();
};

function renderPosProducts() {
    const searchKeyword = document.getElementById('posSearchInput').value.trim().toLowerCase();
    const grid = document.getElementById('posProductGrid');

    const filtered = state.produkList.filter((p) => {
        const matchKategori = state.posActiveKategori === 'ALL' || String(p.kategori_id) === String(state.posActiveKategori);
        const matchKeyword =
            !searchKeyword ||
            p.nama_produk.toLowerCase().includes(searchKeyword) ||
            p.kode_produk.toLowerCase().includes(searchKeyword);
        return matchKategori && matchKeyword;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-12 text-center py-5 text-muted">
                <i class="fa-solid fa-box-open fs-2 mb-2 d-block"></i>
                Tidak ada produk yang sesuai dengan pencarian/filter.
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered
        .map((p) => {
            const imgUrl = p.foto_url || 'https://placehold.co/200x150/2C221E/D4AF37?text=Tembakau';
            const habis = Number(p.stok_saat_ini) <= 0;
            const adaGrosir = Number(p.min_grosir) > 0 && Number(p.harga_grosir) > 0;

            return `
                <div class="col-6 col-md-4">
                    <div class="pos-product-card ${habis ? 'out-of-stock' : ''}" onclick="${habis ? '' : `addToCart(${p.id})`}">
                        <div class="position-relative">
                            <img src="${escapeHtml(imgUrl)}" class="pos-product-img" alt="${escapeHtml(p.nama_produk)}">
                            <span class="position-absolute top-0 end-0 m-1 badge ${habis ? 'bg-danger' : 'bg-espresso text-gold'}">
                                Stok: ${p.stok_saat_ini}
                            </span>
                        </div>
                        <div class="p-2 d-flex flex-column flex-grow-1 justify-content-between">
                            <div>
                                <small class="text-muted d-block" style="font-size: 0.7rem;">${escapeHtml(p.kategori?.nama_kategori || '-')}</small>
                                <div class="fw-bold text-espresso small lh-sm mb-1">${escapeHtml(p.nama_produk)}</div>
                            </div>
                            <div class="mt-1 pt-1 border-top">
                                <div class="fw-bold text-espresso">${formatRupiah(p.harga_ecer)} <small class="text-muted fw-normal">/${escapeHtml(p.satuan)}</small></div>
                                ${
                                    adaGrosir
                                        ? `<div class="text-success fw-semibold" style="font-size: 0.72rem;"><i class="fa-solid fa-tags me-1"></i>Grosir ≥${p.min_grosir}:${formatRupiah(p.harga_grosir)}</div>`
                                        : `<div class="text-muted" style="font-size: 0.72rem;">Harga Tetap (Ecer)</div>`
                                }
                            </div>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');
}

window.addToCart = function (produkId) {
    const produk = state.produkList.find((p) => p.id === produkId);
    if (!produk) return;

    if (Number(produk.stok_saat_ini) <= 0) {
        Swal.fire('Stok Habis', 'Produk ini sedang kosong.', 'warning');
        return;
    }

    const existingItem = state.cart.find((item) => item.produk_id === produkId);
    if (existingItem) {
        if (existingItem.qty + 1 > Number(produk.stok_saat_ini)) {
            Swal.fire('Stok Tidak Cukup', `Sisa stok ${produk.nama_produk} hanya ${produk.stok_saat_ini} ${produk.satuan}.`, 'warning');
            return;
        }
        existingItem.qty += 1;
        applyAutoWholesaleRule(existingItem, produk);
    } else {
        const newItem = {
            produk_id: produk.id,
            kode_produk: produk.kode_produk,
            nama_produk: produk.nama_produk,
            satuan: produk.satuan,
            qty: 1,
            stok_tersedia: Number(produk.stok_saat_ini),
            harga_modal: Number(produk.harga_modal),
            harga_ecer: Number(produk.harga_ecer),
            harga_grosir: Number(produk.harga_grosir),
            min_grosir: Number(produk.min_grosir),
            tipe_harga: 'ECER',
            manual_override: false,
            harga_aktif: Number(produk.harga_ecer)
        };
        applyAutoWholesaleRule(newItem, produk);
        state.cart.push(newItem);
    }

    renderCart();
};

function applyAutoWholesaleRule(cartItem, produkRef) {
    const minGrosir = Number(produkRef?.min_grosir ?? cartItem.min_grosir);
    const hargaGrosir = Number(produkRef?.harga_grosir ?? cartItem.harga_grosir);
    const hargaEcer = Number(produkRef?.harga_ecer ?? cartItem.harga_ecer);

    if (!cartItem.manual_override) {
        if (minGrosir > 0 && hargaGrosir > 0 && cartItem.qty >= minGrosir) {
            cartItem.tipe_harga = 'GROSIR';
            cartItem.harga_aktif = hargaGrosir;
        } else {
            cartItem.tipe_harga = 'ECER';
            cartItem.harga_aktif = hargaEcer;
        }
    } else {
        cartItem.harga_aktif = cartItem.tipe_harga === 'GROSIR' && hargaGrosir > 0 ? hargaGrosir : hargaEcer;
    }
}

window.updateCartQty = function (produkId, deltaOrValue, isDirectInput = false) {
    const itemIndex = state.cart.findIndex((i) => i.produk_id === produkId);
    if (itemIndex === -1) return;

    const item = state.cart[itemIndex];
    const newQty = isDirectInput ? parseInt(deltaOrValue, 10) : item.qty + deltaOrValue;

    if (isNaN(newQty) || newQty <= 0) {
        state.cart.splice(itemIndex, 1);
        renderCart();
        return;
    }

    if (newQty > item.stok_tersedia) {
        Swal.fire('Stok Terbatas', `Stok maksimal yang tersedia adalah ${item.stok_tersedia} ${item.satuan}.`, 'warning');
        item.qty = item.stok_tersedia;
    } else {
        item.qty = newQty;
    }

    applyAutoWholesaleRule(item);
    renderCart();
};

window.toggleCartPriceType = function (produkId) {
    const item = state.cart.find((i) => i.produk_id === produkId);
    if (!item) return;

    if (item.harga_grosir <= 0) {
        Swal.fire('Info', 'Produk ini tidak memiliki harga grosir.', 'info');
        return;
    }

    item.manual_override = true;
    item.tipe_harga = item.tipe_harga === 'ECER' ? 'GROSIR' : 'ECER';
    item.harga_aktif = item.tipe_harga === 'GROSIR' ? item.harga_grosir : item.harga_ecer;
    renderCart();
};

window.removeFromCart = function (produkId) {
    state.cart = state.cart.filter((i) => i.produk_id !== produkId);
    renderCart();
};

function renderCart() {
    const container = document.getElementById('posCartItems');
    const countText = document.getElementById('posCartCountText');

    const totalItems = state.cart.reduce((sum, i) => sum + i.qty, 0);
    countText.textContent = `${state.cart.length} Produk (${totalItems} Qty)`;

    if (state.cart.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted small">
                <i class="fa-solid fa-cart-arrow-down fs-2 mb-2 d-block text-secondary"></i>
                Keranjang masih kosong.<br>Klik produk di sebelah kiri untuk menambahkan.
            </div>
        `;
    } else {
        container.innerHTML = state.cart
            .map((item) => {
                const subtotalItem = item.qty * item.harga_aktif;
                const isGrosir = item.tipe_harga === 'GROSIR';

                return `
                    <div class="cart-item-row">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            <div>
                                <span class="fw-bold text-espresso small">${escapeHtml(item.nama_produk)}</span>
                                <div class="d-flex align-items-center gap-1 mt-1">
                                    <button type="button" class="badge border-0 ${isGrosir ? 'bg-gold text-espresso' : 'bg-secondary text-white'}" onclick="toggleCartPriceType(${item.produk_id})" title="Klik untuk ganti mode Ecer / Grosir">
                                        <i class="fa-solid fa-repeat me-1"></i>${item.tipe_harga}
                                    </button>
                                    <small class="text-muted">@ ${formatRupiah(item.harga_aktif)}</small>
                                </div>
                            </div>
                            <button class="btn btn-xs text-danger" onclick="removeFromCart(${item.produk_id})">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <div class="d-flex justify-content-between align-items-center mt-2">
                            <div class="input-group input-group-sm" style="width: 115px;">
                                <button class="btn btn-outline-secondary px-2" type="button" onclick="updateCartQty(${item.produk_id}, -1)">-</button>
                                <input type="number" class="form-control text-center px-1 fw-bold" value="${item.qty}" min="1" max="${item.stok_tersedia}" onchange="updateCartQty(${item.produk_id}, this.value, true)">
                                <button class="btn btn-outline-secondary px-2" type="button" onclick="updateCartQty(${item.produk_id}, 1)">+</button>
                            </div>
                            <span class="fw-bold text-espresso">${formatRupiah(subtotalItem)}</span>
                        </div>
                    </div>
                `;
            })
            .join('');
    }

    calculatePosTotals();
}

function calculatePosTotals() {
    const subtotal = state.cart.reduce((sum, i) => sum + i.qty * i.harga_aktif, 0);
    const diskonInput = Number(document.getElementById('posDiskonInput').value) || 0;
    const diskonValid = Math.min(Math.max(0, diskonInput), subtotal);
    const totalAkhir = Math.max(0, subtotal - diskonValid);

    document.getElementById('posSubtotalText').textContent = formatRupiah(subtotal);
    document.getElementById('posTotalAkhirText').textContent = formatRupiah(totalAkhir);

    const metode = document.getElementById('posMetodeBayar').value;
    const uangDiterimaEl = document.getElementById('posUangDiterima');

    if (metode !== 'Tunai' && state.cart.length > 0) {
        uangDiterimaEl.value = totalAkhir;
    }

    const uangDiterima = Number(uangDiterimaEl.value) || 0;
    const kembalian = uangDiterima - totalAkhir;
    const kembalianEl = document.getElementById('posKembalianText');

    if (uangDiterima === 0 && totalAkhir === 0) {
        kembalianEl.textContent = 'Rp 0';
        kembalianEl.className = 'fw-bold fs-6 text-success';
    } else if (kembalian < 0) {
        kembalianEl.textContent = `Kurang ${formatRupiah(Math.abs(kembalian))}`;
        kembalianEl.className = 'fw-bold fs-6 text-danger';
    } else {
        kembalianEl.textContent = formatRupiah(kembalian);
        kembalianEl.className = 'fw-bold fs-6 text-success';
    }

    return { subtotal, diskon: diskonValid, totalAkhir, uangDiterima, kembalian };
}

async function prosesTransaksiBayar() {
    if (state.cart.length === 0) {
        Swal.fire('Keranjang Kosong', 'Tambahkan minimal 1 produk ke keranjang sebelum memproses pembayaran.', 'warning');
        return;
    }

    const { subtotal, diskon, totalAkhir, uangDiterima, kembalian } = calculatePosTotals();

    if (uangDiterima < totalAkhir) {
        Swal.fire('Nominal Bayar Kurang', 'Uang yang diterima masih kurang dari Total Akhir.', 'error');
        return;
    }

    const namaPelanggan = document.getElementById('posNamaPelanggan').value.trim() || 'Pelanggan Umum';
    const noWaPelanggan = document.getElementById('posWaPelanggan').value.trim();
    const metodeBayar = document.getElementById('posMetodeBayar').value;

    // Hitung HPP dan Laba Kotor
    const totalHpp = state.cart.reduce((sum, i) => sum + i.qty * i.harga_modal, 0);
    const labaKotor = totalAkhir - totalHpp;

    // Buat Nomor Nota Unik: INV-YYYYMMDD-XXXX
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randPart = Math.floor(1000 + Math.random() * 9000);
    const noNota = `INV-${datePart}-${randPart}`;

    showLoading('Memproses transaksi & memotong stok...');
    try {
        // 1. Simpan Header Transaksi ke tabel `transaksi`
        const { data: trxData, error: trxError } = await supabaseClient
            .from('transaksi')
            .insert([
                {
                    no_nota: noNota,
                    tanggal: now.toISOString(),
                    nama_pelanggan: namaPelanggan,
                    no_wa_pelanggan: noWaPelanggan,
                    subtotal: subtotal,
                    diskon: diskon,
                    total_akhir: totalAkhir,
                    total_hpp: totalHpp,
                    laba_kotor: labaKotor,
                    metode_bayar: metodeBayar,
                    uang_diterima: uangDiterima,
                    kembalian: kembalian
                }
            ])
            .select()
            .single();

        if (trxError) throw trxError;

        // 2. Simpan Detail Item ke tabel `transaksi_detail`
        const detailPayload = state.cart.map((item) => ({
            transaksi_id: trxData.id,
            produk_id: item.produk_id,
            kode_produk_snapshot: item.kode_produk,
            nama_produk_snapshot: item.nama_produk,
            satuan_snapshot: item.satuan,
            qty: item.qty,
            tipe_harga: item.tipe_harga,
            harga_modal_satuan: item.harga_modal,
            harga_jual_satuan: item.harga_aktif,
            subtotal_item: item.qty * item.harga_aktif
        }));

        const { error: detailError } = await supabaseClient
            .from('transaksi_detail')
            .insert(detailPayload);

        if (detailError) throw detailError;

        // 3. Kurangi stok_saat_ini di tabel `produk`
        for (const item of state.cart) {
            const stokBaru = Math.max(0, item.stok_tersedia - item.qty);
            const { error: stokErr } = await supabaseClient
                .from('produk')
                .update({ stok_saat_ini: stokBaru, updated_at: new Date().toISOString() })
                .eq('id', item.produk_id);
            if (stokErr) throw stokErr;
        }

        // Siapkan data struk
        const strukObj = {
            ...trxData,
            items: detailPayload
        };

        // Reset Keranjang & Form POS
        state.cart = [];
        document.getElementById('posNamaPelanggan').value = '';
        document.getElementById('posWaPelanggan').value = '';
        document.getElementById('posDiskonInput').value = 0;
        document.getElementById('posUangDiterima').value = '';

        // Refresh data di background
        await Promise.all([fetchProduk(), fetchTransaksiLaporan()]);
        renderDashboard();
        renderPosProducts();
        renderCart();
        renderKatalogPublik();

        hideLoading();

        // 4. Tampilkan Modal Struk Pembayaran
        tampilkanModalStruk(strukObj);
    } catch (err) {
        hideLoading();
        Swal.fire('Gagal Memproses Transaksi', err.message, 'error');
    }
}

/**
 * ============================================================================
 * CETAK STRUK THERMAL (58MM) & KIRIM VIA WHATSAPP
 * ============================================================================
 */
function tampilkanModalStruk(strukData) {
    state.lastStrukData = strukData;

    document.getElementById('strukNamaToko').textContent = state.pengaturan.nama_toko;
    document.getElementById('strukAlamatToko').textContent = state.pengaturan.alamat;
    document.getElementById('strukTeleponToko').textContent = `Telp/WA: ${state.pengaturan.no_telepon}`;

    document.getElementById('strukNoNota').textContent = strukData.no_nota;
    document.getElementById('strukMetodeBayar').textContent = strukData.metode_bayar;
    document.getElementById('strukTanggal').textContent = formatTanggalWaktu(strukData.tanggal);
    document.getElementById('strukPelanggan').textContent = strukData.nama_pelanggan || 'Pelanggan Umum';

    const itemsContainer = document.getElementById('strukItemList');
    itemsContainer.innerHTML = (strukData.items || [])
        .map((item) => `
            <div class="mb-1">
                <div class="fw-bold">${escapeHtml(item.nama_produk_snapshot)} ${item.tipe_harga === 'GROSIR' ? '(G)' : ''}</div>
                <div class="d-flex justify-content-between">
                    <span>${item.qty} x ${formatAngkaBiasa(item.harga_jual_satuan)}</span>
                    <span>${formatAngkaBiasa(item.subtotal_item)}</span>
                </div>
            </div>
        `)
        .join('');

    document.getElementById('strukSubtotal').textContent = formatRupiah(strukData.subtotal);
    const rowDiskon = document.getElementById('strukRowDiskon');
    if (Number(strukData.diskon) > 0) {
        rowDiskon.classList.remove('d-none');
        document.getElementById('strukDiskon').textContent = `-${formatRupiah(strukData.diskon)}`;
    } else {
        rowDiskon.classList.add('d-none');
    }

    document.getElementById('strukTotalAkhir').textContent = formatRupiah(strukData.total_akhir);
    document.getElementById('strukUangDiterima').textContent = formatRupiah(strukData.uang_diterima);
    document.getElementById('strukKembalian').textContent = formatRupiah(strukData.kembalian);
    document.getElementById('strukFooter').textContent = state.pengaturan.catatan_struk || 'Terima kasih!';

    document.getElementById('strukInputWa').value = strukData.no_wa_pelanggan || '';

    const modal = new bootstrap.Modal(document.getElementById('modalStruk'));
    modal.show();
}

function kirimStrukKeWhatsApp() {
    if (!state.lastStrukData) return;

    let rawPhone = document.getElementById('strukInputWa').value.trim();
    if (!rawPhone) {
        Swal.fire('Nomor WA Kosong', 'Masukkan nomor WhatsApp pelanggan terlebih dahulu.', 'warning');
        return;
    }

    // Normalisasi Nomor WA ke kode negara 62
    let cleanPhone = rawPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
        cleanPhone = '62' + cleanPhone.slice(1);
    }

    const s = state.lastStrukData;
    const garis = '--------------------------------';

    let pesan = `*${state.pengaturan.nama_toko.toUpperCase()}*\n`;
    pesan += `${state.pengaturan.alamat}\n`;
    pesan += `WA: ${state.pengaturan.no_telepon}\n`;
    pesan += `${garis}\n`;
    pesan += `No. Nota : *${s.no_nota}*\n`;
    pesan += `Tanggal  : ${formatTanggalWaktu(s.tanggal)}\n`;
    pesan += `Pelanggan: ${s.nama_pelanggan || 'Pelanggan Umum'}\n`;
    pesan += `Metode   : ${s.metode_bayar}\n`;
    pesan += `${garis}\n`;

    (s.items || []).forEach((item) => {
        const labelGrosir = item.tipe_harga === 'GROSIR' ? ' [Grosir]' : '';
        pesan += `• *${item.nama_produk_snapshot}*${labelGrosir}\n`;
        pesan += `  ${item.qty} x ${formatRupiah(item.harga_jual_satuan)} = *${formatRupiah(item.subtotal_item)}*\n`;
    });

    pesan += `${garis}\n`;
    pesan += `Subtotal : ${formatRupiah(s.subtotal)}\n`;
    if (Number(s.diskon) > 0) {
        pesan += `Diskon   : -${formatRupiah(s.diskon)}\n`;
    }
    pesan += `*TOTAL   : ${formatRupiah(s.total_akhir)}*\n`;
    pesan += `Bayar    : ${formatRupiah(s.uang_diterima)}\n`;
    pesan += `Kembali  : ${formatRupiah(s.kembalian)}\n`;
    pesan += `${garis}\n`;
    pesan += `_${state.pengaturan.catatan_struk || 'Terima kasih telah berbelanja!'}_`;

    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(pesan)}`;
    window.open(waUrl, '_blank');
}

/**
 * ============================================================================
 * 5. MODUL LAPORAN TRANSAKSI & EXPORT EXCEL (.XLSX)
 * ============================================================================
 */
function renderTabelLaporan() {
    if (state.dataTables.laporan) {
        state.dataTables.laporan.destroy();
    }

    // Hitung Summary Periode
    const totalNota = state.transaksiList.length;
    const totalOmzet = state.transaksiList.reduce((sum, t) => sum + Number(t.total_akhir || 0), 0);
    const totalDiskon = state.transaksiList.reduce((sum, t) => sum + Number(t.diskon || 0), 0);
    const totalLaba = state.transaksiList.reduce((sum, t) => sum + Number(t.laba_kotor || 0), 0);

    document.getElementById('lapTotalNota').textContent = `${totalNota} Nota`;
    document.getElementById('lapTotalOmzet').textContent = formatRupiah(totalOmzet);
    document.getElementById('lapTotalDiskon').textContent = formatRupiah(totalDiskon);
    document.getElementById('lapTotalLaba').textContent = formatRupiah(totalLaba);

    const tbody = document.getElementById('tbodyLaporan');
    tbody.innerHTML = state.transaksiList
        .map((t) => `
            <tr>
                <td class="fw-bold text-espresso"><code>${escapeHtml(t.no_nota)}</code></td>
                <td class="small text-nowrap">${formatTanggalWaktu(t.tanggal)}</td>
                <td>
                    <div class="fw-medium">${escapeHtml(t.nama_pelanggan || 'Pelanggan Umum')}</div>
                    ${t.no_wa_pelanggan ? `<small class="text-muted"><i class="fa-brands fa-whatsapp text-success me-1"></i>${escapeHtml(t.no_wa_pelanggan)}</small>` : ''}
                </td>
                <td><span class="badge bg-light text-dark border">${escapeHtml(t.metode_bayar)}</span></td>
                <td class="text-end">${formatRupiah(t.subtotal)}</td>
                <td class="text-end text-danger">${Number(t.diskon) > 0 ? `-${formatRupiah(t.diskon)}` : 'Rp 0'}</td>
                <td class="text-end fw-bold text-espresso">${formatRupiah(t.total_akhir)}</td>
                <td class="text-end fw-semibold text-success">${formatRupiah(t.laba_kotor)}</td>
                <td class="text-end text-nowrap">
                    <button class="btn btn-sm btn-outline-espresso" onclick="lihatDetailStrukLaporan(${t.id})" title="Lihat Detail / Cetak Struk">
                        <i class="fa-solid fa-eye me-1"></i> Detail
                    </button>
                </td>
            </tr>
        `)
        .join('');

    state.dataTables.laporan = $('#tableLaporan').DataTable({
        pageLength: 10,
        order: [],
        language: {
            search: 'Cari Nota / Pelanggan:',
            lengthMenu: '_MENU_ data',
            info: 'Menampilkan _START_ - _END_ dari _TOTAL_ transaksi',
            zeroRecords: 'Tidak ada data transaksi pada rentang tanggal ini'
        }
    });
}

window.lihatDetailStrukLaporan = function (transaksiId) {
    const trx = state.transaksiList.find((t) => t.id === transaksiId);
    if (!trx) return;

    tampilkanModalStruk({
        ...trx,
        items: trx.transaksi_detail || []
    });
};

function exportLaporanKeExcel() {
    if (state.transaksiList.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data transaksi untuk di-export pada periode ini.', 'info');
        return;
    }

    // Sheet 1: Ringkasan Nota Transaksi
    const dataRingkasan = state.transaksiList.map((t, idx) => ({
        'No': idx + 1,
        'No. Nota': t.no_nota,
        'Tanggal & Waktu': formatTanggalWaktu(t.tanggal),
        'Nama Pelanggan': t.nama_pelanggan || 'Pelanggan Umum',
        'No. WhatsApp': t.no_wa_pelanggan || '-',
        'Metode Bayar': t.metode_bayar,
        'Subtotal (Rp)': Number(t.subtotal),
        'Diskon (Rp)': Number(t.diskon),
        'Total Akhir (Rp)': Number(t.total_akhir),
        'Total HPP (Rp)': Number(t.total_hpp),
        'Laba Kotor (Rp)': Number(t.laba_kotor)
    }));

    // Sheet 2: Rincian Item Terjual per Nota
    const dataRincianItem = [];
    state.transaksiList.forEach((t) => {
        (t.transaksi_detail || []).forEach((d) => {
            dataRincianItem.push({
                'No. Nota': t.no_nota,
                'Tanggal': formatTanggalWaktu(t.tanggal),
                'Kode Produk': d.kode_produk_snapshot || '-',
                'Nama Produk': d.nama_produk_snapshot,
                'Tipe Harga': d.tipe_harga,
                'Qty': Number(d.qty),
                'Satuan': d.satuan_snapshot || '-',
                'Harga Modal Satuan (Rp)': Number(d.harga_modal_satuan),
                'Harga Jual Satuan (Rp)': Number(d.harga_jual_satuan),
                'Subtotal Item (Rp)': Number(d.subtotal_item)
            });
        });
    });

    const wb = XLSX.utils.book_new();
    const wsRingkasan = XLSX.utils.json_to_sheet(dataRingkasan);
    const wsRincian = XLSX.utils.json_to_sheet(dataRincianItem);

    XLSX.utils.book_append_sheet(wb, wsRingkasan, 'Laporan Transaksi');
    XLSX.utils.book_append_sheet(wb, wsRincian, 'Rincian Item Terjual');

    const tglMulai = document.getElementById('filterTanggalMulai').value || 'All';
    const tglAkhir = document.getElementById('filterTanggalAkhir').value || 'All';
    const fileName = `Laporan_POS_Tembakau_${tglMulai}_sd_${tglAkhir}.xlsx`;

    XLSX.writeFile(wb, fileName);
}

/**
 * ============================================================================
 * 6. MODUL KATALOG PUBLIK (MODE PELANGGAN)
 * ============================================================================
 */
function renderKatalogPublik() {
    // Render Kategori Pills Katalog
    const filterContainer = document.getElementById('katalogCategoryFilter');
    const pills = [
        `<button type="button" class="category-pill ${state.katalogActiveKategori === 'ALL' ? 'active' : ''}" onclick="setKatalogKategori('ALL')">Semua Varian</button>`
    ];
    state.kategoriList.forEach((k) => {
        const active = String(state.katalogActiveKategori) === String(k.id);
        pills.push(
            `<button type="button" class="category-pill ${active ? 'active' : ''}" onclick="setKatalogKategori('${k.id}')">${escapeHtml(k.nama_kategori)}</button>`
        );
    });
    filterContainer.innerHTML = pills.join('');

    // Filter Produk Katalog
    const keyword = document.getElementById('katalogSearchInput').value.trim().toLowerCase();
    const filtered = state.produkList.filter((p) => {
        const matchKat = state.katalogActiveKategori === 'ALL' || String(p.kategori_id) === String(state.katalogActiveKategori);
        const matchKey = !keyword || p.nama_produk.toLowerCase().includes(keyword);
        return matchKat && matchKey;
    });

    const grid = document.getElementById('katalogProductGrid');
    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-12 text-center py-5 text-muted">Produk tidak ditemukan.</div>`;
        return;
    }

    grid.innerHTML = filtered
        .map((p) => {
            const imgUrl = p.foto_url || 'https://placehold.co/300x220/2C221E/D4AF37?text=Tembakau+Pilihan';
            const stok = Number(p.stok_saat_ini);
            const adaGrosir = Number(p.min_grosir) > 0 && Number(p.harga_grosir) > 0;

            return `
                <div class="col-6 col-md-4 col-xl-3">
                    <div class="card h-100 border-0 shadow-sm overflow-hidden">
                        <div class="position-relative">
                            <img src="${escapeHtml(imgUrl)}" class="w-100" style="height: 170px; object-fit: cover;" alt="${escapeHtml(p.nama_produk)}">
                            <span class="position-absolute top-0 end-0 m-2 badge ${stok > 0 ? 'bg-success' : 'bg-danger'}">
                                ${stok > 0 ? `Tersedia (${stok}${escapeHtml(p.satuan)})` : 'Stok Habis'}
                            </span>
                        </div>
                        <div class="card-body d-flex flex-column justify-content-between">
                            <div>
                                <span class="badge bg-light text-secondary border mb-1">${escapeHtml(p.kategori?.nama_kategori || 'Tembakau')}</span>
                                <h6 class="fw-bold text-espresso mb-2">${escapeHtml(p.nama_produk)}</h6>
                            </div>
                            <div class="pt-2 border-top">
                                <div class="d-flex justify-content-between align-items-baseline">
                                    <span class="small text-muted">Harga Ecer:</span>
                                    <span class="fw-bold fs-6 text-espresso">${formatRupiah(p.harga_ecer)}/${escapeHtml(p.satuan)}</span>
                                </div>
                                ${
                                    adaGrosir
                                        ? `<div class="d-flex justify-content-between align-items-baseline mt-1 p-1 rounded bg-warning-subtle">
                                            <span class="small fw-semibold text-espresso">Grosir (≥${p.min_grosir}):</span>
                                            <span class="fw-bold text-success small">${formatRupiah(p.harga_grosir)}/${escapeHtml(p.satuan)}</span>
                                           </div>`
                                        : ''
                                }
                            </div>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');
}

window.setKatalogKategori = function (katId) {
    state.katalogActiveKategori = katId;
    renderKatalogPublik();
};

/**
 * ============================================================================
 * REGISTRASI SELURUH EVENT LISTENER DOM
 * ============================================================================
 */
function initEventListeners() {
    // Refresh Data Manual
    document.getElementById('btnRefreshData').addEventListener('click', loadAllInitialData);

    // Buka Modal Tambah Produk Baru
    document.getElementById('btnTambahProduk').addEventListener('click', () => {
        state.compressedImageBlob = null;
        document.getElementById('formProduk').reset();
        document.getElementById('modalProdukTitle').textContent = 'Tambah Produk Baru';
        document.getElementById('prodId').value = '';
        document.getElementById('prodFotoUrlLama').value = '';
        document.getElementById('prodKode').value = generateKodeProdukOtomatis();
        document.getElementById('prodFotoPreview').src = 'https://placehold.co/100x100/2C221E/D4AF37?text=No+Image';
        document.getElementById('infoKompresiFoto').innerHTML = 'Pilih gambar untuk dikompres otomatis (Maks 800px, JPEG 70%).';

        const modal = new bootstrap.Modal(document.getElementById('modalProduk'));
        modal.show();
    });

    // Generate Kode Produk
    document.getElementById('btnGenKode').addEventListener('click', () => {
        document.getElementById('prodKode').value = generateKodeProdukOtomatis();
    });

    // Kompresi Gambar Otomatis saat File Dipilih
    document.getElementById('prodFotoInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const ukuranAsliKb = (file.size / 1024).toFixed(1);
            const hasil = await compressImageClientSide(file, 800, 0.7);
            state.compressedImageBlob = hasil.blob;
            const ukuranKompresKb = (hasil.blob.size / 1024).toFixed(1);

            document.getElementById('prodFotoPreview').src = hasil.previewUrl;
            document.getElementById('infoKompresiFoto').innerHTML = `
                <span class="text-success fw-semibold"><i class="fa-solid fa-check-circle me-1"></i>Terkompresi Otomatis!</span><br>
                Resolusi: <b>${hasil.width}x${hasil.height}px</b> | Ukuran: <s>${ukuranAsliKb} KB</s> -> <b>${ukuranKompresKb} KB</b> (JPEG 70%)
            `;
        } catch (err) {
            Swal.fire('Gagal Kompres Gambar', err.message, 'error');
        }
    });

    // Submit Form Simpan Produk (Tambah / Edit + Upload Supabase Storage)
    document.getElementById('formProduk').addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('prodId').value;
        let fotoUrlFinal = document.getElementById('prodFotoUrlLama').value || null;

        showLoading('Menyimpan produk & mengunggah foto...');
        try {
            // Jika ada foto baru yang sudah dikompres, unggah ke bucket `produk-images`
            if (state.compressedImageBlob) {
                const fileName = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
                const { error: uploadErr } = await supabaseClient.storage
                    .from(BUCKET_PRODUK)
                    .upload(fileName, state.compressedImageBlob, {
                        contentType: 'image/jpeg',
                        upsert: true
                    });

                if (uploadErr) throw uploadErr;

                const { data: publicUrlData } = supabaseClient.storage
                    .from(BUCKET_PRODUK)
                    .getPublicUrl(fileName);

                fotoUrlFinal = publicUrlData.publicUrl;
            }

            const payload = {
                kode_produk: document.getElementById('prodKode').value.trim(),
                nama_produk: document.getElementById('prodNama').value.trim(),
                kategori_id: Number(document.getElementById('prodKategoriId').value),
                satuan: document.getElementById('prodSatuan').value,
                harga_modal: Number(document.getElementById('prodHargaModal').value) || 0,
                harga_ecer: Number(document.getElementById('prodHargaEcer').value) || 0,
                harga_grosir: Number(document.getElementById('prodHargaGrosir').value) || 0,
                min_grosir: Number(document.getElementById('prodMinGrosir').value) || 0,
                stok_saat_ini: Number(document.getElementById('prodStokSaatIni').value) || 0,
                batas_stok_minimum: Number(document.getElementById('prodBatasStokMin').value) || 0,
                foto_url: fotoUrlFinal,
                updated_at: new Date().toISOString()
            };

            if (id) {
                const { error } = await supabaseClient.from('produk').update(payload).eq('id', Number(id));
                if (error) throw error;
            } else {
                const { error } = await supabaseClient.from('produk').insert([payload]);
                if (error) throw error;
            }

            bootstrap.Modal.getInstance(document.getElementById('modalProduk')).hide();
            await fetchProduk();
            renderDashboard();
            renderPosProducts();
            renderKatalogPublik();

            Swal.fire('Berhasil!', 'Data produk telah disimpan.', 'success');
        } catch (err) {
            Swal.fire('Gagal Menyimpan Produk', err.message, 'error');
        } finally {
            hideLoading();
        }
    });

    // Pilihan Produk di Form Riwayat Stok
    document.getElementById('stokProdukId').addEventListener('change', (e) => {
        const prod = state.produkList.find((p) => String(p.id) === String(e.target.value));
        const infoEl = document.getElementById('infoStokSaatIni');
        if (prod) {
            infoEl.textContent = `Stok saat ini: ${prod.stok_saat_ini} ${prod.satuan} (Batas minimum: ${prod.batas_stok_minimum})`;
        } else {
            infoEl.textContent = 'Stok saat ini: -';
        }
    });

    // Submit Form Restock / Stock Opname
    document.getElementById('formRiwayatStok').addEventListener('submit', async (e) => {
        e.preventDefault();
        const produkId = Number(document.getElementById('stokProdukId').value);
        const jenis = document.getElementById('stokJenisPerubahan').value;
        const jumlah = Number(document.getElementById('stokJumlah').value);
        const keterangan = document.getElementById('stokKeterangan').value.trim();

        const produk = state.produkList.find((p) => p.id === produkId);
        if (!produk) return;

        const stokSebelum = Number(produk.stok_saat_ini);
        let stokSesudah = stokSebelum;

        if (jenis === 'RESTOCK' || jenis === 'OPNAME_TAMBAH') {
            stokSesudah = stokSebelum + jumlah;
        } else if (jenis === 'OPNAME_KURANG') {
            if (jumlah > stokSebelum) {
                Swal.fire('Jumlah Melebihi Stok', `Pengurangan (${jumlah}) tidak boleh melebihi stok saat ini (${stokSebelum}).`, 'warning');
                return;
            }
            stokSesudah = stokSebelum - jumlah;
        }

        showLoading('Memperbarui stok & mencatat riwayat...');
        try {
            const { error: riwayatErr } = await supabaseClient.from('riwayat_stok').insert([
                {
                    produk_id: produkId,
                    jenis_perubahan: jenis,
                    jumlah: jumlah,
                    stok_sebelum: stokSebelum,
                    stok_sesudah: stokSesudah,
                    keterangan: keterangan
                }
            ]);
            if (riwayatErr) throw riwayatErr;

            const { error: prodErr } = await supabaseClient
                .from('produk')
                .update({ stok_saat_ini: stokSesudah, updated_at: new Date().toISOString() })
                .eq('id', produkId);
            if (prodErr) throw prodErr;

            document.getElementById('formRiwayatStok').reset();
            document.getElementById('infoStokSaatIni').textContent = 'Stok saat ini: -';

            await Promise.all([fetchProduk(), fetchRiwayatStok()]);
            renderDashboard();
            renderPosProducts();
            renderKatalogPublik();

            Swal.fire('Stok Diperbarui!', `Stok ${produk.nama_produk} berubah dari ${stokSebelum} menjadi ${stokSesudah} ${produk.satuan}.`, 'success');
        } catch (err) {
            Swal.fire('Gagal Update Stok', err.message, 'error');
        } finally {
            hideLoading();
        }
    });

    // Event Listener POS (Search, Diskon, Pembayaran)
    document.getElementById('posSearchInput').addEventListener('input', renderPosProducts);
    document.getElementById('btnClearPosSearch').addEventListener('click', () => {
        document.getElementById('posSearchInput').value = '';
        renderPosProducts();
    });

    document.getElementById('btnClearCart').addEventListener('click', () => {
        state.cart = [];
        renderCart();
    });

    document.getElementById('posDiskonInput').addEventListener('input', calculatePosTotals);
    document.getElementById('posUangDiterima').addEventListener('input', calculatePosTotals);
    document.getElementById('posMetodeBayar').addEventListener('change', calculatePosTotals);

    document.querySelectorAll('.quick-cash-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const val = btn.getAttribute('data-cash');
            const { totalAkhir } = calculatePosTotals();
            document.getElementById('posUangDiterima').value = val === 'exact' ? totalAkhir : Number(val);
            calculatePosTotals();
        });
    });

    document.getElementById('btnProsesBayar').addEventListener('click', prosesTransaksiBayar);

    // Event Listener Modal Struk (Print 58mm & WhatsApp)
    document.getElementById('btnCetakStrukThermal').addEventListener('click', () => {
        window.print();
    });
    document.getElementById('btnKirimWaStruk').addEventListener('click', kirimStrukKeWhatsApp);

    // Event Listener Laporan Transaksi & Export Excel
    document.getElementById('btnFilterLaporan').addEventListener('click', async () => {
        showLoading('Memfilter laporan transaksi...');
        try {
            await fetchTransaksiLaporan();
        } finally {
            hideLoading();
        }
    });

    document.getElementById('btnResetFilterLaporan').addEventListener('click', async () => {
        document.getElementById('filterTanggalMulai').value = '';
        document.getElementById('filterTanggalAkhir').value = '';
        showLoading('Memuat seluruh transaksi...');
        try {
            await fetchTransaksiLaporan();
        } finally {
            hideLoading();
        }
    });

    document.getElementById('btnExportExcel').addEventListener('click', exportLaporanKeExcel);

    // Event Listener Katalog Publik
    document.getElementById('katalogSearchInput').addEventListener('input', renderKatalogPublik);
    document.getElementById('btnToggleFullscreenKatalog').addEventListener('click', () => {
        document.getElementById('appWrapper').classList.toggle('kiosk-mode');
    });

    // Event Listener Pengaturan Toko & Tambah Kategori
    document.getElementById('formPengaturanToko').addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading('Menyimpan pengaturan toko...');
        try {
            const payload = {
                id: 1,
                nama_toko: document.getElementById('setNamaToko').value.trim(),
                slogan: document.getElementById('setSlogan').value.trim(),
                alamat: document.getElementById('setAlamat').value.trim(),
                no_telepon: document.getElementById('setNoTelepon').value.trim(),
                catatan_struk: document.getElementById('setCatatanStruk').value.trim(),
                updated_at: new Date().toISOString()
            };

            const { error } = await supabaseClient.from('pengaturan_toko').upsert(payload);
            if (error) throw error;

            await fetchPengaturanToko();
            Swal.fire('Tersimpan!', 'Pengaturan identitas toko berhasil diperbarui.', 'success');
        } catch (err) {
            Swal.fire('Gagal Menyimpan', err.message, 'error');
        } finally {
            hideLoading();
        }
    });

    document.getElementById('formTambahKategori').addEventListener('submit', async (e) => {
        e.preventDefault();
        const namaBaru = document.getElementById('inputNamaKategoriBaru').value.trim();
        if (!namaBaru) return;

        showLoading('Menambahkan kategori...');
        try {
            const { error } = await supabaseClient.from('kategori').insert([{ nama_kategori: namaBaru }]);
            if (error) throw error;

            document.getElementById('inputNamaKategoriBaru').value = '';
            await fetchKategori();
            renderPosCategoryPills();
            renderKatalogPublik();
            Swal.fire('Berhasil', `Kategori "${namaBaru}" berhasil ditambahkan.`, 'success');
        } catch (err) {
            Swal.fire('Gagal', err.message, 'error');
        } finally {
            hideLoading();
        }
    });
}
