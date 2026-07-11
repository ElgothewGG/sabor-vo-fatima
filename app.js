// ════════════════════════════════════════════════════════════
//  FIREBASE — CONFIGURAÇÃO E AUTH
// ════════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            "AIzaSyCSBQaD2y4P9VmB1QwKBGDzk2gtUj5dL54",
  authDomain:        "vofatima-23b27.firebaseapp.com",
  projectId:         "vofatima-23b27",
  storageBucket:     "vofatima-23b27.firebasestorage.app",
  messagingSenderId: "200206195141",
  appId:             "1:200206195141:web:fbe714c07209ca342993ac"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// Firestore sem persistência local — conecta sempre ao servidor para sync em tempo real

let currentUser = null;

function loginGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => {
    showToast('Erro ao entrar: ' + err.message, '#d9534f');
  });
}

function logout() {
  if (!confirm('Sair do aplicativo?')) return;
  if (window._dbUnsub) { window._dbUnsub(); window._dbUnsub = null; }
  auth.signOut();
}

auth.onAuthStateChanged(async user => {
  const loginScreen  = document.getElementById('login-screen');
  const headerUser   = document.getElementById('header-user');
  const headerName   = document.getElementById('header-user-name');
  if (user) {
    currentUser = user;
    loginScreen.style.display  = 'none';
    headerUser.style.display   = 'flex';
    headerName.textContent     = user.displayName || user.email;
    await loadUserData(user.uid);
  } else {
    currentUser = null;
    loginScreen.style.display = 'flex';
    headerUser.style.display  = 'none';
  }
});

async function loadUserData(uid) {
  // Cancela listener anterior se existir
  if (window._dbUnsub) { window._dbUnsub(); window._dbUnsub = null; }

  const docRef = db.collection('usuarios').doc(uid);

  // Carga inicial dos dados
  try {
    const doc = await docRef.get();
    if (doc.exists) {
      const d = doc.data();
      ingredientes = (d.ingredientes && d.ingredientes.length) ? d.ingredientes : DEFAULT_INGR;
      salvas       = d.salvas   || [];
      cart         = d.cart     || [];
      modelos      = d.modelos  || [];
      frete        = R(d.frete) || 0;
    } else {
      // Primeiro login — verifica se havia dados no localStorage para migrar
      const lsIngr    = tryParse(localStorage.getItem('vf_ingredientes'));
      const lsSalvas  = tryParse(localStorage.getItem('vf_salvas'));
      const lsCart    = tryParse(localStorage.getItem('vf_cart'));
      const lsModelos = tryParse(localStorage.getItem('vf_modelos'));
      const lsFrete   = parseFloat(localStorage.getItem('vf_frete') || '0');
      ingredientes = lsIngr   || DEFAULT_INGR;
      salvas       = lsSalvas || [];
      cart         = lsCart   || [];
      modelos      = lsModelos || [];
      frete        = lsFrete;
      saveDB();
      if (lsIngr) showToast('📦 Dados migrados para a nuvem!');
    }
  } catch (e) {
    console.warn('Firestore indisponível, usando padrão:', e);
    ingredientes = tryParse(localStorage.getItem('vf_ingredientes')) || DEFAULT_INGR;
    salvas       = tryParse(localStorage.getItem('vf_salvas'))       || [];
    cart         = tryParse(localStorage.getItem('vf_cart'))         || [];
    modelos      = tryParse(localStorage.getItem('vf_modelos'))      || [];
    frete        = parseFloat(localStorage.getItem('vf_frete') || '0');
  }

  renderModelos();
  renderMontar();
  updatePriceBar();
  updateCartBadge();

  // Listener em tempo real — sincroniza mudanças de outros dispositivos automaticamente
  window._dbUnsub = docRef.onSnapshot(snapshot => {
    if (!snapshot.exists) return;
    // hasPendingWrites=true → mudança local ainda em trânsito → ignora para evitar loop
    if (snapshot.metadata.hasPendingWrites) return;
    const d = snapshot.data();
    ingredientes = (d.ingredientes && d.ingredientes.length) ? d.ingredientes : DEFAULT_INGR;
    salvas       = d.salvas   || [];
    cart         = d.cart     || [];
    modelos      = d.modelos  || [];
    frete        = R(d.frete) || 0;
    localStorage.setItem('vf_ingredientes', JSON.stringify(ingredientes));
    localStorage.setItem('vf_salvas',       JSON.stringify(salvas));
    localStorage.setItem('vf_cart',         JSON.stringify(cart));
    localStorage.setItem('vf_modelos',      JSON.stringify(modelos));
    localStorage.setItem('vf_frete',        String(frete));
    renderModelos();
    renderMontar();
    updatePriceBar();
    updateCartBadge();
    renderSalvas();
    renderPedido();
    showToast('🔄 Sincronizado');
  }, err => console.warn('Sync listener error:', err));
}

let _saveTimer = null;
function saveDB() {
  if (!currentUser) return;
  // Salva também em localStorage como backup offline
  localStorage.setItem('vf_ingredientes', JSON.stringify(ingredientes));
  localStorage.setItem('vf_salvas',       JSON.stringify(salvas));
  localStorage.setItem('vf_cart',         JSON.stringify(cart));
  localStorage.setItem('vf_modelos',      JSON.stringify(modelos));
  localStorage.setItem('vf_frete',        String(frete));
  // Debounce: agrupa múltiplas alterações seguidas em 1 escrita
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    db.collection('usuarios').doc(currentUser.uid).set({
      ingredientes, salvas, cart, modelos, frete,
      updatedAt: new Date().toISOString()
    }).catch(err => {
      console.error('[saveDB]', err.code, err.message);
    });
  }, 800);
}

function tryParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

// ════════════════════════════════════════════════════════════
//  DEFAULT DATA
// ════════════════════════════════════════════════════════════
const DEFAULT_INGR = [
  { id: uid(), nome: 'Arroz',              preco: 22,   qtd: 5,   unidade: 'kg' },
  { id: uid(), nome: 'Feijão Carioca',     preco: 7,    qtd: 1,   unidade: 'kg' },
  { id: uid(), nome: 'Feijão Preto',       preco: 8,    qtd: 1,   unidade: 'kg' },
  { id: uid(), nome: 'Frango',             preco: 17,   qtd: 1,   unidade: 'kg' },
  { id: uid(), nome: 'Pernil',             preco: 20,   qtd: 1,   unidade: 'kg' },
  { id: uid(), nome: 'Carne Moída',        preco: 20,   qtd: 1,   unidade: 'kg' },
  { id: uid(), nome: 'Brócolis Congelado', preco: 11.9, qtd: 1,   unidade: 'kg' },
  { id: uid(), nome: 'Vagem',              preco: 12.9, qtd: 400, unidade: 'g'  },
  { id: uid(), nome: 'Cenoura',            preco: 7.5,  qtd: 500, unidade: 'g'  },
  { id: uid(), nome: 'Pote',               preco: 167,  qtd: 144, unidade: 'unidade' },
  { id: uid(), nome: 'Rótulo/Etiqueta',    preco: 85,   qtd: 300, unidade: 'unidade' },
];

// ════════════════════════════════════════════════════════════
//  STATE (preenchido por loadUserData)
// ════════════════════════════════════════════════════════════
let ingredientes   = [];
let salvas         = [];
let cart           = [];
let modelos        = [];
let frete          = 0;
let selection      = {};
let editingId      = null;
let editingCartIdx = null;
let editingSalvaId = null;

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function R(n)  { const x = parseFloat(n); return isNaN(x) ? 0 : x; }

// ════════════════════════════════════════════════════════════
//  CÁLCULO DE PREÇO
// ════════════════════════════════════════════════════════════
function precoPorGrama(ingr) {
  if (ingr.unidade === 'kg')      return ingr.preco / (ingr.qtd * 1000);
  if (ingr.unidade === 'g')       return ingr.preco / ingr.qtd;
  if (ingr.unidade === 'unidade') return ingr.preco / ingr.qtd;
  return 0;
}

function custoItem(ingr, qtdUsada) {
  return precoPorGrama(ingr) * qtdUsada;
}

function custoTotal() {
  let t = 0;
  for (const [id, sel] of Object.entries(selection)) {
    const ingr = ingredientes.find(i => i.id === id);
    if (!ingr || !sel.qtd) continue;
    t += custoItem(ingr, sel.qtd);
  }
  return t;
}

function calcPreco(custo, margem, taxaCartao, imposto) {
  const M    = margem     / 100;
  const taxa = taxaCartao / 100;
  const imp  = imposto    / 100;
  const custoEfetivo = custo * (1 + imp);
  const denom        = (1 - M) * (1 - taxa);
  if (denom <= 0 || custo === 0) {
    return { precoBase: 0, lucro: 0, margemReal: 0, custoEfetivo };
  }
  const precoBase  = custoEfetivo / denom;
  const receitaLiq = precoBase * (1 - taxa);
  const lucro      = receitaLiq - custoEfetivo;
  const margemReal = receitaLiq > 0 ? (lucro / receitaLiq) * 100 : 0;
  return { precoBase, lucro, margemReal, custoEfetivo };
}

function calcComDesconto(precoBase, desconto, taxaCartao, custoEfetivo) {
  if (desconto === 0) return null;
  const precoFinal = precoBase * (1 - desconto / 100);
  const receitaLiq = precoFinal * (1 - taxaCartao / 100);
  const lucro      = receitaLiq - custoEfetivo;
  const margemReal = receitaLiq > 0 ? (lucro / receitaLiq) * 100 : 0;
  return { precoFinal, lucro, margemReal };
}

// ════════════════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════════════════
function showScreen(name, btn) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'montar')       { renderModelos(); renderMontar(); updatePriceBar(); }
  if (name === 'ingredientes') renderIngredientes();
  if (name === 'pedido')       renderPedido();
  if (name === 'salvas')       renderSalvas();
}

// ════════════════════════════════════════════════════════════
//  MODELOS DE MARMITA
// ════════════════════════════════════════════════════════════
function custoModelo(m) {
  let t = 0;
  (m.ingrs || []).forEach(({ id, qtd }) => {
    const ingr = ingredientes.find(i => i.id === id);
    if (ingr && qtd) t += custoItem(ingr, qtd);
  });
  return t;
}

function renderModelos() {
  const scroll = document.getElementById('modelos-scroll');
  const hint   = document.getElementById('modelos-empty-hint');
  if (!scroll) return;

  if (!modelos.length) {
    scroll.innerHTML = '';
    hint.style.display = 'block';
    setCustomOpen(true);
    return;
  }
  hint.style.display = 'none';

  scroll.innerHTML = modelos.map(m => {
    const custo = custoModelo(m);
    const preco = m.precoVenda || calcPreco(custo, 60, 0, 0).precoBase;
    const subLabel = m.precoVenda ? 'preço salvo · toque para usar' : '60% margem · toque para usar';
    return `
    <div class="modelo-card" onclick="usarModelo('${m.id}')">
      <button class="modelo-card-edit" onclick="event.stopPropagation();editModelo('${m.id}')" style="position:absolute;top:6px;right:30px;background:none;border:none;cursor:pointer;font-size:14px;padding:2px">✏️</button>
      <button class="modelo-card-del" onclick="event.stopPropagation();apagarModelo('${m.id}')">🗑️</button>
      <div class="modelo-card-nome">${m.nome}</div>
      <div class="modelo-card-preco">R$ ${fmt(preco)}</div>
      <div class="modelo-card-sub">${subLabel}</div>
    </div>`;
  }).join('');

  setCustomOpen(false);
}

function setCustomOpen(open) {
  const body  = document.getElementById('custom-body');
  const arrow = document.getElementById('custom-toggle-arrow');
  if (!body) return;
  body.style.display  = open ? 'block' : 'none';
  if (arrow) arrow.textContent = open ? '▲' : '▼';
}

function toggleCustom() {
  const body = document.getElementById('custom-body');
  if (!body) return;
  setCustomOpen(body.style.display === 'none');
}

function usarModelo(id) {
  const m = modelos.find(x => x.id === id);
  if (!m) return;
  selection = {};
  (m.ingrs || []).forEach(i => { selection[i.id] = { qtd: i.qtd }; });
  setCustomOpen(true);
  renderMontar();
  updatePriceBar();
  setTimeout(() => {
    document.getElementById('modal-pedido-nome').value = m.nome;
    openMargensModal();
  }, 80);
  showToast(`⭐ "${m.nome}" carregado!`);
}

function editModelo(id) {
  const m = modelos.find(x => x.id === id);
  if (!m) return;
  window._editingModeloId = id;
  selection = {};
  (m.ingrs || []).forEach(i => { selection[i.id] = { qtd: i.qtd }; });
  setCustomOpen(true);
  renderMontar();
  updatePriceBar();
  const nomeInput = document.getElementById('modelo-nome');
  if (nomeInput) nomeInput.value = m.nome;
  openModal('modal-salvar-modelo');
  showToast('✏️ Editando "' + m.nome + '"');
}

function apagarModelo(id) {
  if (!confirm('Apagar este modelo?')) return;
  modelos = modelos.filter(m => m.id !== id);
  saveDB();
  renderModelos();
  showToast('🗑️ Modelo apagado');
}

function openSaveModeloModal() {
  if (custoTotal() === 0) {
    showToast('⚠️ Adicione ingredientes com quantidade', '#d9534f'); return;
  }
  document.getElementById('modelo-nome').value = '';
  if (document.getElementById('modal-margens').classList.contains('open'))
    closeModal('modal-margens');
  openModal('modal-salvar-modelo');
  setTimeout(() => document.getElementById('modelo-nome').focus(), 220);
}

function confirmarSalvarModelo() {
  const nome = document.getElementById('modelo-nome').value.trim();
  if (!nome) { showToast('⚠️ Digite um nome para o modelo', '#d9534f'); return; }
  const ingrsSnap = Object.entries(selection)
    .filter(([, s]) => s.qtd)
    .map(([id, s]) => ({ id, qtd: s.qtd }));
  const pfEl = document.getElementById('rc-preco-final-input');
  const precoVenda = (pfEl && parseFloat(pfEl.value) > 0)
    ? parseFloat(pfEl.value)
    : (window._lastCalcR ? window._lastCalcR.precoBase : null);
  if (window._editingModeloId) {
    const _idx = modelos.findIndex(x => x.id === window._editingModeloId);
    if (_idx !== -1) modelos[_idx] = { ...modelos[_idx], nome, ingrs: ingrsSnap, ...(precoVenda ? { precoVenda } : {}) };
    window._editingModeloId = null;
  } else {
    modelos.unshift({ id: uid(), nome, ingrs: ingrsSnap, ...(precoVenda ? { precoVenda } : {}), criadoEm: new Date().toLocaleDateString('pt-BR') });
  }
  saveDB();
  closeModal('modal-salvar-modelo');
  renderModelos();
  showToast(`⭐ Modelo "${nome}" salvo!`);
}

// ════════════════════════════════════════════════════════════
//  INGREDIENTES — render
// ════════════════════════════════════════════════════════════
function renderIngredientes() {
  const list  = document.getElementById('ingr-list');
  const empty = document.getElementById('ingr-empty');
  if (!ingredientes.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  list.innerHTML = ingredientes.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })).map(i => {
    const ppg    = precoPorGrama(i);
    const unStr  = i.unidade === 'unidade'
      ? `R$ ${fmt(ppg)} / unidade`
      : `R$ ${fmt(ppg * 1000)} / kg`;
    const qtdStr = i.unidade === 'kg'
      ? `${i.qtd} kg`
      : i.unidade === 'g'
        ? `${i.qtd} g`
        : `${i.qtd} unidades`;
    return `
    <div class="ingr-item">
      <div class="ingr-item-info">
        <div class="ingr-item-name">${i.nome}</div>
        <div class="ingr-item-price">Pagou R$ ${fmt(i.preco)} em ${qtdStr} → ${unStr}</div>
      </div>
      <div class="ingr-item-actions">
        <button class="btn btn-outline btn-sm" onclick="editIngrediente('${i.id}')">✏️</button>
        <button class="btn btn-danger btn-sm"  onclick="deleteIngrediente('${i.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
//  INGREDIENTES — CRUD
// ════════════════════════════════════════════════════════════
function saveIngrediente() {
  const nome    = document.getElementById('ingr-nome').value.trim();
  const preco   = parseFloat(document.getElementById('ingr-preco').value.replace(',','.'));
  const qtd     = parseFloat(document.getElementById('ingr-qtd').value.replace(',','.'));
  const unidade = document.getElementById('ingr-unidade').value;
  if (!nome || isNaN(preco) || isNaN(qtd) || preco <= 0 || qtd <= 0) {
    showToast('⚠️ Preencha todos os campos', '#d9534f'); return;
  }
  if (editingId) {
    const idx = ingredientes.findIndex(i => i.id === editingId);
    if (idx >= 0) ingredientes[idx] = { id: editingId, nome, preco, qtd, unidade };
    editingId = null;
  } else {
    ingredientes.push({ id: uid(), nome, preco, qtd, unidade });
  }
  saveDB();
  clearIngrForm();
  renderIngredientes();
  showToast('✅ Ingrediente salvo!');
}

function editIngrediente(id) {
  const i = ingredientes.find(x => x.id === id);
  if (!i) return;
  editingId = id;
  document.getElementById('ingr-nome').value    = i.nome;
  document.getElementById('ingr-preco').value   = i.preco;
  document.getElementById('ingr-qtd').value     = i.qtd;
  document.getElementById('ingr-unidade').value = i.unidade;
  document.getElementById('ingr-form-title').textContent = '✏️ Editar ingrediente';
  document.getElementById('ingr-cancel-btn').style.display = 'inline-flex';
  document.getElementById('ingr-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEditIngrediente() { editingId = null; clearIngrForm(); }

function clearIngrForm() {
  ['ingr-nome','ingr-preco','ingr-qtd'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ingr-unidade').value = 'kg';
  document.getElementById('ingr-form-title').textContent = '➕ Adicionar ingrediente';
  document.getElementById('ingr-cancel-btn').style.display = 'none';
}

function deleteIngrediente(id) {
  if (!confirm('Apagar este ingrediente?')) return;
  ingredientes = ingredientes.filter(i => i.id !== id);
  delete selection[id];
  saveDB();
  renderIngredientes();
  showToast('🗑️ Ingrediente apagado');
}

// ════════════════════════════════════════════════════════════
//  MONTAR
// ════════════════════════════════════════════════════════════
function renderMontar() {
  const list  = document.getElementById('montar-list');
  const empty = document.getElementById('montar-empty');
  if (!ingredientes.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  list.innerHTML = ingredientes.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })).map(ingr => {
    const sel        = selection[ingr.id];
    const isSelected = !!sel;
    const qtdVal     = sel ? sel.qtd : '';
    const unLabel    = ingr.unidade === 'unidade' ? 'unidades' : 'gramas (g)';
    const custo      = isSelected && qtdVal ? custoItem(ingr, qtdVal) : 0;
    const ppg        = precoPorGrama(ingr);
    const subLabel   = ingr.unidade === 'unidade'
      ? `R$ ${fmt(ppg)} / unidade`
      : `R$ ${fmt(ppg * 1000)}/kg · R$ ${fmt(ppg * 100)}/100g`;

    return `
    <div class="sel-item ${isSelected ? 'selected' : ''}" id="si-${ingr.id}" onclick="toggleIngr('${ingr.id}')">
      <div class="sel-item-check">${isSelected ? '✓' : ''}</div>
      <div class="sel-item-body">
        <div class="sel-item-name">${ingr.nome}</div>
        <div class="sel-item-sub">${subLabel}</div>
        ${isSelected ? `
        <div class="qty-row" onclick="event.stopPropagation()">
          <label>Qtd (${unLabel}):</label>
          <input type="number" inputmode="decimal" min="0" step="any"
            value="${qtdVal}" placeholder="Ex: 200"
            onchange="setQtd('${ingr.id}', this.value)"
            oninput="setQtd('${ingr.id}', this.value)" />
          <span class="qty-cost">${custo > 0 ? 'R$ ' + fmt(custo) : ''}</span>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function toggleIngr(id) {
  if (selection[id]) { delete selection[id]; }
  else               { selection[id] = { qtd: '' }; }
  renderMontar();
  updatePriceBar();
  if (selection[id] !== undefined) {
    setTimeout(() => {
      const inp = document.querySelector(`#si-${id} .qty-row input`);
      if (inp) inp.focus();
    }, 60);
  }
}

function setQtd(id, val) {
  const n = parseFloat(String(val).replace(',','.'));
  selection[id] = { qtd: (isNaN(n) || n < 0) ? '' : n };
  const ingr = ingredientes.find(i => i.id === id);
  const c    = (ingr && selection[id].qtd) ? custoItem(ingr, selection[id].qtd) : 0;
  const el   = document.querySelector(`#si-${id} .qty-cost`);
  if (el) el.textContent = c > 0 ? 'R$ ' + fmt(c) : '';
  updatePriceBar();
}

// ════════════════════════════════════════════════════════════
//  PRICE BAR
// ════════════════════════════════════════════════════════════
function updatePriceBar() {
  const bar      = document.getElementById('price-bar');
  const isMontar = document.getElementById('screen-montar').classList.contains('active');
  if (!isMontar) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';

  const custo = custoTotal();
  if (custo === 0) {
    document.getElementById('pb-price-val').textContent = 'R$ 0,00';
    document.getElementById('pb-label').textContent = 'Selecione ingredientes e quantidades';
    return;
  }
  const r = calcPreco(custo, 60, 0, 0);
  document.getElementById('pb-price-val').textContent = 'R$ ' + fmt(r.precoBase);
  document.getElementById('pb-label').textContent = 'Preço sugerido (60% de margem)';
}

// ════════════════════════════════════════════════════════════
//  MODAL CALCULADORA — abrir
// ════════════════════════════════════════════════════════════
function openMargensModal() {
  const custo = custoTotal();

  const rows = Object.entries(selection)
    .filter(([, s]) => s.qtd)
    .map(([id, s]) => {
      const ingr = ingredientes.find(i => i.id === id);
      if (!ingr) return '';
      const c  = custoItem(ingr, s.qtd);
      const un = ingr.unidade === 'unidade' ? `${s.qtd} und` : `${s.qtd}g`;
      return `<div class="cs-row"><span>${ingr.nome} (${un})</span><span>R$ ${fmt(c)}</span></div>`;
    }).join('');

  document.getElementById('modal-ingr-rows').innerHTML =
    rows + `<div class="cs-row cs-total"><span>Custo total</span><span>R$ ${fmt(custo)}</span></div>`;
  document.getElementById('modal-custo-label').textContent =
    `Custo dos ingredientes: R$ ${fmt(custo)}`;

  if (!document.getElementById('modal-pedido-nome').value) {
    const preview = Object.entries(selection)
      .filter(([, s]) => s.qtd)
      .map(([id]) => ingredientes.find(i => i.id === id)?.nome)
      .filter(Boolean).slice(0, 2).join(' + ');
    document.getElementById('modal-pedido-nome').value =
      preview ? `Marmita (${preview})` : '';
  }

  updateModalCalc();
  openModal('modal-margens');
}

// ════════════════════════════════════════════════════════════
//  MODAL CALCULADORA — atualização em tempo real
// ════════════════════════════════════════════════════════════
function updateModalCalc() {
  const custo      = custoTotal();
  const qtd        = Math.max(1, parseInt(document.getElementById('modal-qtd').value) || 1);
  const taxa       = R(document.getElementById('modal-taxa').value);
  const imposto    = R(document.getElementById('modal-imposto').value);
  const desconto   = R(document.getElementById('modal-desconto').value);
  const margemAlvo = parseInt(document.getElementById('modal-margem-alvo').value) || 60;

  const dv = document.getElementById('modal-desconto-val');
  dv.textContent = desconto > 0 ? `${desconto}% de desconto sobre o preço normal` : 'Sem desconto';
  dv.style.color = desconto > 0 ? 'var(--verde)' : '#aaa';

  if (custo === 0) {
    ['rc-preco','rc-lucro-unit','rc-custo-efetivo'].forEach(id =>
      document.getElementById(id).textContent = 'R$ 0,00');
    document.getElementById('rc-margem-real').textContent    = '0%';
    document.getElementById('rc-disc-section').style.display = 'none';
    document.getElementById('rc-qty-block').style.display    = 'none';
    document.getElementById('modal-margens-body').innerHTML  = '';
    return;
  }

  const r = calcPreco(custo, margemAlvo, taxa, imposto);
  window._lastCalcR = r;

  document.getElementById('rc-preco').textContent         = 'R$ ' + fmt(r.precoBase);
  document.getElementById('rc-lucro-unit').textContent    = 'R$ ' + fmt(r.lucro);
  document.getElementById('rc-margem-real').textContent   = fmt1(r.margemReal) + '%';
  document.getElementById('rc-custo-efetivo').textContent = 'R$ ' + fmt(r.custoEfetivo);
  document.getElementById('rc-lucro-label').textContent   = 'Lucro / marmita';
  const _pfInput = document.getElementById('rc-preco-final-input');
  if (_pfInput && _pfInput !== document.activeElement) _pfInput.value = r.precoBase.toFixed(2);
  const _pfLabel = document.getElementById('rc-preco-sugerido-label');
  if (_pfLabel) _pfLabel.textContent = 'Sugerido: R$ ' + fmt(r.precoBase);

  const disc = calcComDesconto(r.precoBase, desconto, taxa, r.custoEfetivo);
  if (disc) {
    document.getElementById('rc-disc-section').style.display  = 'block';
    document.getElementById('rc-desc-pct').textContent        = `${desconto}%`;
    document.getElementById('rc-preco-orig-novo').textContent = 'R$ ' + fmt(r.precoBase);
    document.getElementById('rc-preco-com-desc').textContent  = 'R$ ' + fmt(disc.precoFinal);
    document.getElementById('rc-margem-com-desc').textContent =
      `Margem real com desconto: ${fmt1(disc.margemReal)}%  ·  Lucro: R$ ${fmt(disc.lucro)}`;
  } else {
    document.getElementById('rc-disc-section').style.display = 'none';
  }

  const precoParaQtd = disc ? disc.precoFinal : r.precoBase;
  const lucroParaQtd = disc ? disc.lucro       : r.lucro;
  if (qtd > 1) {
    document.getElementById('rc-qty-block').style.display = 'block';
    document.getElementById('rc-qty-label').textContent   =
      `Total para ${qtd} marmitas${disc ? ' (com desconto)' : ''}:`;
    document.getElementById('rc-qty-total-txt').textContent =
      `Cliente paga R$ ${fmt(precoParaQtd * qtd)}  ·  Lucro R$ ${fmt(lucroParaQtd * qtd)}`;
  } else {
    document.getElementById('rc-qty-block').style.display = 'none';
  }

  const margens = [30, 35, 40, 45, 50, 55, 60];
  document.getElementById('modal-margens-body').innerHTML = margens.map(m => {
    const ri = calcPreco(custo, m, taxa, imposto);
    const hl = m === margemAlvo;
    return `<tr ${hl ? 'class="hl"' : ''}>
      <td>${m}%${hl ? ' <span class="badge">✓</span>' : ''}</td>
      <td>R$ ${fmt(ri.precoBase)}</td>
      <td>R$ ${fmt(ri.lucro)}</td>
    </tr>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
//  MODAL — copiar preço (sem salvar nada)
// ════════════════════════════════════════════════════════════
function atualizarPrecoFinal(val) {
  const preco = parseFloat((val || '0').replace(',', '.')) || 0;
  if (!window._lastCalcR || preco <= 0) return;
  const custoEf = window._lastCalcR.custoEfetivo;
  const lucro   = preco - custoEf;
  const margem  = preco > 0 ? (lucro / preco * 100) : 0;
  document.getElementById('rc-preco').textContent         = 'R$ ' + fmt(preco);
  document.getElementById('rc-lucro-unit').textContent    = 'R$ ' + fmt(lucro);
  document.getElementById('rc-margem-real').textContent   = fmt1(margem) + '%';
  document.getElementById('rc-lucro-label').textContent   = 'Lucro / marmita';
}

function copiarPreco() {
  const custo = custoTotal();
  if (custo === 0) { showToast('⚠️ Adicione ingredientes com quantidade', '#d9534f'); return; }

  const taxa       = R(document.getElementById('modal-taxa').value);
  const imposto    = R(document.getElementById('modal-imposto').value);
  const desconto   = R(document.getElementById('modal-desconto').value);
  const margemAlvo = parseInt(document.getElementById('modal-margem-alvo').value) || 60;
  const qtdMarmitas = Math.max(1, parseInt(document.getElementById('modal-qtd').value) || 1);
  const nome       = document.getElementById('modal-pedido-nome').value.trim() || 'Marmita';

  const r    = calcPreco(custo, margemAlvo, taxa, imposto);
  const disc = calcComDesconto(r.precoBase, desconto, taxa, r.custoEfetivo);
  const precoUnit = disc ? disc.precoFinal : r.precoBase;

  const EMBAL = ['pote', 'rotulo', 'etiqueta', 'embalagem', 'tampa', 'saco', 'bandeja'];
  const ingrLines = Object.entries(selection)
    .filter(([, s]) => s.qtd)
    .map(([id, s]) => {
      const ingr = ingredientes.find(i => i.id === id);
      if (!ingr) return null;
      const nm = ingr.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (EMBAL.some(kw => nm.includes(kw))) return null;
      const qtdStr = ingr.unidade === 'unidade'
        ? Math.round(s.qtd) + ' und'
        : Math.round(s.qtd) + 'g';
      return `• ${ingr.nome} — ${qtdStr}`;
    })
    .filter(Boolean);

  let txt = `🍱 ${nome}\n\n`;
  if (ingrLines.length) txt += `📋 O que tem dentro:\n${ingrLines.join('\n')}\n\n`;

  if (qtdMarmitas === 1) {
    txt += `💰 Valor: R$ ${fmt(precoUnit)}`;
    if (disc) txt += ` (com ${desconto}% de desconto)`;
    txt += '\n';
  } else {
    txt += `💰 Valor unitário: R$ ${fmt(precoUnit)}\n`;
    if (disc) txt += `🏷️ Com ${desconto}% de desconto (de R$ ${fmt(r.precoBase)} por R$ ${fmt(precoUnit)})\n`;
    txt += `📦 Total (${qtdMarmitas} marmitas): R$ ${fmt(precoUnit * qtdMarmitas)}\n`;
  }

  if (frete > 0) {
    txt += `🚚 Frete: R$ ${fmt(frete)}\n`;
    txt += `💵 Total com frete: R$ ${fmt(precoUnit * qtdMarmitas + frete)}\n`;
  }

  txt += `\n✅ Pagamento via PIX — sem acréscimo\n`;
  txt += `\nAguardando sua confirmação! 🍱❤️`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(txt).then(() => showToast('✅ Orçamento copiado!'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('✅ Orçamento copiado!');
  }
}

function expandClienteFechou() {
  const section = document.getElementById('cliente-fechou-section');
  section.style.display = 'block';
  document.getElementById('btn-cliente-fechou').textContent = '✅ Cliente confirmado ▲';
  setTimeout(() => document.getElementById('modal-pedido-nome').focus(), 120);
  // Scroll suave para a seção
  setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);
}

function toggleAjustes() {
  const body  = document.getElementById('ajustes-body');
  const arrow = document.getElementById('ajustes-arrow');
  const open  = body.style.display !== 'none';
  body.style.display  = open ? 'none' : 'block';
  arrow.textContent   = open ? '▼' : '▲';
}

function fecharModal() {
  // Reseta estados de expansão ao fechar
  document.getElementById('cliente-fechou-section').style.display = 'none';
  document.getElementById('btn-cliente-fechou').textContent = '✅ Cliente fechou';
  closeModal('modal-margens');
}

// ════════════════════════════════════════════════════════════
//  MODAL SALVAR CLIENTE (pela aba ou pelo botão no modal)
// ════════════════════════════════════════════════════════════
function openSaveModal() {
  if (custoTotal() === 0) {
    showToast('⚠️ Adicione ingredientes com quantidade', '#d9534f'); return;
  }
  document.getElementById('salvar-nome').value = '';
  // Pré-preenche com o nome já digitado, se houver
  const nomeAtual = document.getElementById('modal-pedido-nome').value.trim();
  if (nomeAtual) document.getElementById('salvar-nome').value = nomeAtual;
  if (document.getElementById('modal-margens').classList.contains('open'))
    closeModal('modal-margens');
  openModal('modal-salvar');
  setTimeout(() => document.getElementById('salvar-nome').focus(), 220);
}

function confirmarSalvar() {
  const nome = document.getElementById('salvar-nome').value.trim();
  if (!nome) { showToast('⚠️ Digite um nome', '#d9534f'); return; }
  const custo = custoTotal();
  const pv    = calcPreco(custo, 60, 0, 0).precoBase;
  const itens = Object.entries(selection)
    .filter(([, s]) => s.qtd)
    .map(([id, s]) => {
      const ingr = ingredientes.find(i => i.id === id);
      return ingr ? { id, nome: ingr.nome, qtd: s.qtd, unidade: ingr.unidade } : null;
    }).filter(Boolean);
  salvas.unshift({
    id: uid(), nome,
    data: new Date().toLocaleDateString('pt-BR'),
    custo, precoVenda: pv, itens
  });
  saveDB();
  closeModal('modal-salvar');
  showToast(`✅ "${nome}" salvo como cliente!`);
}

// ════════════════════════════════════════════════════════════
//  SALVAR CLIENTE + ADICIONAR AO PEDIDO (um clique só)
// ════════════════════════════════════════════════════════════
function salvarEAdicionarAoPedido() {
  const nome = document.getElementById('modal-pedido-nome').value.trim();
  if (!nome) { showToast('⚠️ Digite um nome primeiro', '#d9534f'); return; }
  const custo = custoTotal();
  if (custo === 0) { showToast('⚠️ Adicione ingredientes com quantidade', '#d9534f'); return; }

  // Salva como cliente
  const pv    = calcPreco(custo, 60, 0, 0).precoBase;
  const itens = Object.entries(selection)
    .filter(([, s]) => s.qtd)
    .map(([id, s]) => {
      const ingr = ingredientes.find(i => i.id === id);
      return ingr ? { id, nome: ingr.nome, qtd: s.qtd, unidade: ingr.unidade } : null;
    }).filter(Boolean);
  salvas.unshift({
    id: uid(), nome,
    data: new Date().toLocaleDateString('pt-BR'),
    custo, precoVenda: pv, itens
  });

  // Adiciona ao pedido
  addToPedido(true); // true = pular fechar modal (já fecha no addToPedido)
  showToast(`✅ "${nome}" salvo e adicionado ao pedido!`);
}

// ════════════════════════════════════════════════════════════
//  CLIENTES — lista
// ════════════════════════════════════════════════════════════
function renderSalvas() {
  const list  = document.getElementById('salvas-list');
  const empty = document.getElementById('salvas-empty');
  if (!salvas.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  list.innerHTML = salvas.map(s => {
    const resumo = s.itens
      .map(i => `${i.nome} ${i.qtd}${i.unidade === 'unidade' ? 'und' : 'g'}`)
      .join(' · ');
    return `
    <div class="saved-item">
      <div class="saved-item-head">
        <div>
          <div class="saved-item-name">👤 ${s.nome}</div>
          <div class="saved-item-date">Cadastrado em ${s.data}</div>
          <div class="saved-item-ingrs">${resumo}</div>
        </div>
        <div class="saved-item-price">R$ ${fmt(s.precoVenda)}</div>
      </div>
      <div class="saved-item-actions">
        <button class="btn btn-success btn-sm" onclick="calcularSalva('${s.id}')">📊 Calcular</button>
        <button class="btn btn-outline btn-sm" onclick="editSalva('${s.id}')">✏️ Editar</button>
        <button class="btn btn-danger btn-sm"  onclick="apagarSalva('${s.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function calcularSalva(id) {
  const s = salvas.find(x => x.id === id);
  if (!s) return;
  selection = {};
  s.itens.forEach(i => { selection[i.id] = { qtd: i.qtd }; });
  showScreen('montar', document.querySelector('nav button'));
  setTimeout(() => {
    document.getElementById('modal-pedido-nome').value = s.nome;
    openMargensModal();
  }, 120);
  showToast(`📊 Calculando marmita de ${s.nome}…`);
}

// ════════════════════════════════════════════════════════════
//  CLIENTES — editar e adicionar ao pedido
// ════════════════════════════════════════════════════════════
function editSalva(id) {
  const s = salvas.find(x => x.id === id);
  if (!s) return;
  editingSalvaId = id;
  document.getElementById('edit-salva-nome').value  = s.nome;
  document.getElementById('edit-salva-preco').value = s.precoVenda || '';
  document.getElementById('edit-salva-qtd').value   = s.qtdPedido  || 1;
  openModal('modal-edit-salva');
}

function confirmarEditSalva() {
  const s = salvas.find(x => x.id === editingSalvaId);
  if (!s) { closeModal('modal-edit-salva'); return; }
  const nome  = document.getElementById('edit-salva-nome').value.trim();
  const preco = R(document.getElementById('edit-salva-preco').value.replace(',','.'));
  const qtd   = Math.max(1, parseInt(document.getElementById('edit-salva-qtd').value) || 1);
  if (!nome || preco <= 0) { showToast('⚠️ Preencha nome e preço', '#d9534f'); return; }
  s.nome       = nome;
  s.precoVenda = preco;
  s.qtdPedido  = qtd;
  saveDB();
  closeModal('modal-edit-salva');
  renderSalvas();
  showToast(`✅ "${nome}" atualizado!`);
}

function adicionarSalvaAoPedido() {
  const s = salvas.find(x => x.id === editingSalvaId);
  if (!s) return;
  const nome  = document.getElementById('edit-salva-nome').value.trim();
  const preco = R(document.getElementById('edit-salva-preco').value.replace(',','.'));
  const qtd   = Math.max(1, parseInt(document.getElementById('edit-salva-qtd').value) || 1);
  if (!nome || preco <= 0) { showToast('⚠️ Preencha nome e preço', '#d9534f'); return; }
  const ingrs      = (s.itens || []).map(i => ({ id: i.id, nome: i.nome, qtd: i.qtd, unidade: i.unidade }));
  const lucroUnit  = preco - (s.custo || 0);
  const margemReal = preco > 0 ? (lucroUnit / preco) * 100 : 0;
  cart.push({
    id: uid(), nome, qtdMarmitas: qtd,
    custoUnit: s.custo || 0,
    precoUnit: preco,
    lucroUnit, margemReal,
    desconto: 0, taxa: 0, imposto: 0, margemAlvo: 60,
    ingrs,
    addedAt: new Date().toLocaleDateString('pt-BR')
  });
  saveDB();
  updateCartBadge();
  closeModal('modal-edit-salva');
  showToast(`✅ "${nome}" adicionada ao pedido!`);
}

function apagarSalva(id) {
  if (!confirm('Apagar cliente?')) return;
  salvas = salvas.filter(s => s.id !== id);
  saveDB();
  renderSalvas();
  showToast('🗑️ Cliente apagado');
}

// ════════════════════════════════════════════════════════════
//  PEDIDO — adicionar ao carrinho
// ════════════════════════════════════════════════════════════
function addToPedido(skipToast) {
  const nome = document.getElementById('modal-pedido-nome').value.trim();
  if (!nome) { showToast('⚠️ Digite um nome para a marmita', '#d9534f'); return; }
  const custo = custoTotal();
  if (custo === 0) { showToast('⚠️ Adicione ingredientes com quantidade', '#d9534f'); return; }

  const qtdMarmitas = Math.max(1, parseInt(document.getElementById('modal-qtd').value) || 1);
  const taxa        = R(document.getElementById('modal-taxa').value);
  const imposto     = R(document.getElementById('modal-imposto').value);
  const desconto    = R(document.getElementById('modal-desconto').value);
  const margemAlvo  = parseInt(document.getElementById('modal-margem-alvo').value) || 60;

  const r    = calcPreco(custo, margemAlvo, taxa, imposto);
  const disc = calcComDesconto(r.precoBase, desconto, taxa, r.custoEfetivo);

  const precoUnit  = disc ? disc.precoFinal : r.precoBase;
  const lucroUnit  = disc ? disc.lucro      : r.lucro;
  const margemReal = disc ? disc.margemReal : r.margemReal;

  const ingrsSnap = Object.entries(selection)
    .filter(([, s]) => s.qtd)
    .map(([id, s]) => {
      const ingr = ingredientes.find(i => i.id === id);
      return ingr ? { id, nome: ingr.nome, qtd: s.qtd, unidade: ingr.unidade } : null;
    }).filter(Boolean);

  const novoItem = {
    id:        editingCartIdx !== null ? cart[editingCartIdx].id : uid(),
    nome,      qtdMarmitas,
    custoUnit: custo,
    precoUnit, lucroUnit, margemReal,
    desconto,  taxa, imposto, margemAlvo,
    ingrs:     ingrsSnap,
    addedAt:   new Date().toLocaleDateString('pt-BR')
  };

  if (editingCartIdx !== null) {
    cart[editingCartIdx] = novoItem;
    editingCartIdx = null;
    resetAddBtn();
    if (!skipToast) showToast(`✅ "${nome}" atualizada no pedido!`);
  } else {
    cart.push(novoItem);
    if (!skipToast) showToast(`✅ "${nome}" adicionada ao pedido!`);
  }

  saveDB();
  updateCartBadge();
  document.getElementById('modal-pedido-nome').value = '';
  document.getElementById('cliente-fechou-section').style.display = 'none';
  document.getElementById('btn-cliente-fechou').textContent = '✅ Cliente fechou';
  closeModal('modal-margens');
}

// ════════════════════════════════════════════════════════════
//  PEDIDO — editar item do carrinho
// ════════════════════════════════════════════════════════════
function editCartItem(idx) {
  const item = cart[idx];
  if (!item) return;

  selection = {};
  (item.ingrs || []).forEach(i => { selection[i.id] = { qtd: i.qtd }; });

  showScreen('montar', document.querySelector('nav button'));
  editingCartIdx = idx;

  setTimeout(() => {
    document.getElementById('modal-pedido-nome').value  = item.nome;
    document.getElementById('modal-qtd').value          = item.qtdMarmitas;
    document.getElementById('modal-taxa').value         = item.taxa    || 0;
    document.getElementById('modal-imposto').value      = item.imposto || 0;
    document.getElementById('modal-desconto').value     = item.desconto || 0;
    document.getElementById('modal-margem-alvo').value  = item.margemAlvo || 60;

    document.getElementById('btn-add-pedido').textContent       = '💾 Salvar edição';
    document.getElementById('btn-cancel-edit').style.display    = 'block';

    openMargensModal();
    // Auto-abre seção "Cliente fechou" para edição
    expandClienteFechou();
  }, 120);
}

function cancelEditCart() {
  editingCartIdx = null;
  resetAddBtn();
  document.getElementById('cliente-fechou-section').style.display = 'none';
  document.getElementById('btn-cliente-fechou').textContent = '✅ Cliente fechou';
  closeModal('modal-margens');
}

function resetAddBtn() {
  const btn = document.getElementById('btn-add-pedido');
  if (btn) btn.textContent = '➕ Adicionar ao Pedido';
  const cancel = document.getElementById('btn-cancel-edit');
  if (cancel) cancel.style.display = 'none';
}

// ════════════════════════════════════════════════════════════
//  FRETE
// ════════════════════════════════════════════════════════════
function updateFrete(val) {
  frete = Math.max(0, R(String(val).replace(',','.')));
  saveDB();
  updateOrderTotal();
}

function updateOrderTotal() {
  const totBox = document.getElementById('cart-order-total');
  if (!cart.length || !totBox) return;
  const totalItems    = cart.reduce((s, i) => s + i.precoUnit  * i.qtdMarmitas, 0);
  const totalLucro    = cart.reduce((s, i) => s + i.lucroUnit  * i.qtdMarmitas, 0);
  const totalMarmitas = cart.reduce((s, i) => s + i.qtdMarmitas, 0);
  const totalComFrete = totalItems + frete;

  totBox.innerHTML = `
  <div class="order-total">
    <div class="ot-row"><span>Total de marmitas</span><span>${totalMarmitas} un.</span></div>
    ${frete > 0 ? `<div class="ot-row"><span>Subtotal</span><span>R$ ${fmt(totalItems)}</span></div>
    <div class="ot-row"><span>🚚 Frete</span><span>R$ ${fmt(frete)}</span></div>` : ''}
    <div class="ot-row ot-lucro"><span>Lucro estimado</span><span>+R$ ${fmt(totalLucro)}</span></div>
    <div class="ot-main"><span>TOTAL</span><span>R$ ${fmt(totalComFrete)}</span></div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  PEDIDO — render carrinho
// ════════════════════════════════════════════════════════════
function renderPedido() {
  const list         = document.getElementById('cart-list');
  const empty        = document.getElementById('cart-empty');
  const totBox       = document.getElementById('cart-order-total');
  const actBox       = document.getElementById('cart-actions');
  const freteSection = document.getElementById('frete-section');
  const freteInput   = document.getElementById('frete-input');

  if (!cart.length) {
    list.innerHTML = ''; totBox.innerHTML = '';
    empty.style.display = 'block'; actBox.style.display = 'none';
    if (freteSection) freteSection.style.display = 'none';
    return;
  }
  empty.style.display = 'none'; actBox.style.display = 'block';
  if (freteSection) freteSection.style.display = 'block';
  if (freteInput && freteInput.value === '' && frete > 0) freteInput.value = frete;

  list.innerHTML = cart.map((item, idx) => {
    const totalCliente = item.precoUnit  * item.qtdMarmitas;
    const totalLucro   = item.lucroUnit  * item.qtdMarmitas;
    const extras = [
      item.taxa     > 0 ? `cartão ${item.taxa}%`       : '',
      item.imposto  > 0 ? `imposto ${item.imposto}%`   : '',
      item.desconto > 0 ? `desconto ${item.desconto}%` : '',
    ].filter(Boolean).join(' · ') || 'Sem taxas/desconto';

    return `
    <div class="cart-item">
      <div class="cart-item-top">
        <div style="flex:1;min-width:0">
          <div class="cart-item-nome">${item.nome}</div>
          <div class="cart-item-meta">
            ${item.qtdMarmitas} marmita${item.qtdMarmitas > 1 ? 's' : ''}
            × R$ ${fmt(item.precoUnit)} · margem ${item.margemAlvo}%
          </div>
          <div class="cart-item-meta">${extras}</div>
          <div class="cart-item-lucro">
            ✅ Lucro: R$ ${fmt(totalLucro)} (${fmt1(item.margemReal)}% real)
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;margin-left:10px">
          <div class="cart-item-total">R$ ${fmt(totalCliente)}</div>
          <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end">
            <button class="btn btn-outline btn-sm" onclick="editCartItem(${idx})">✏️</button>
            <button class="btn btn-danger btn-sm"  onclick="removeCartItem(${idx})">🗑️</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  updateOrderTotal();
}

function removeCartItem(idx) {
  if (!confirm('Remover este item?')) return;
  cart.splice(idx, 1);
  saveDB();
  updateCartBadge();
  renderPedido();
  showToast('🗑️ Item removido');
}

function limparPedido() {
  if (!confirm('Limpar todo o pedido?')) return;
  cart = [];
  saveDB();
  updateCartBadge();
  renderPedido();
  showToast('🗑️ Pedido limpo');
}

function updateCartBadge() {
  const tab = document.getElementById('tab-pedido');
  const n   = cart.length;
  const old = tab.querySelector('.tab-badge');
  if (old) old.remove();
  if (n > 0) tab.innerHTML = `📋<span class="tab-badge">${n}</span><br>Pedidos`;
  else        tab.innerHTML = `📋<br>Pedidos`;
}

// ════════════════════════════════════════════════════════════
//  RESUMO DO PEDIDO
// ════════════════════════════════════════════════════════════
const EMAALACCEM = ['pote', 'rotulo', 'etiqueta', 'embalagem', 'tampa', 'saco', 'bandeja'];

function isFoodItem(ingr) {
  const n = (ingr.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return !EMBALAGEM.some(kw => n.includes(kw));
}

function formatIngredientQty(ingr) {
  if (ingr.unidade === 'kg') return `${Math.round(ingr.qtd * 1000)}g`;
  if (ingr.unidade === 'g')  return `${ingr.qtd}g`;
  return `${ingr.qtd}`;
}

function openResumoModal() {
  if (!cart.length) { showToast('⚠️ Pedido está vazio', '#d9534f'); return; }
  const hoje = new Date().toLocaleDateString('pt-BR');
  const DIV  = '─'.repeat(40);
  const EMBAL = ['pote', 'rotulo', 'etiqueta', 'embalagem', 'tampa', 'saco', 'bandeja'];
  let txt = `🍱 ORÇAMENTO — Sabor da Vó Fátima\nData: ${hoje}\n\n${DIV}\n\n`;
  let subtotal = 0;
  cart.forEach(item => {
    const total = item.precoUnit * item.qtdMarmitas;
    subtotal += total;
    txt += `🍱 ${item.nome}\n`;
    const foodIngrs = (item.ingrs || []).filter(i => {
      const nm = i.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return !EMBAL.some(kw => nm.includes(kw));
    });
    if (foodIngrs.length) {
      txt += `📋 O que tem dentro:\n`;
      foodIngrs.forEach(i => {
        const qtdStr = i.unidade === 'unidade' ? Math.round(i.qtd) + ' und' : Math.round(i.qtd) + 'g';
        txt += `   • ${i.nome} — ${qtdStr}\n`;
      });
    }
    txt += `💰 ${item.qtdMarmitas} marmita${item.qtdMarmitas > 1 ? 's' : ''} × R$ ${fmt(item.precoUnit)} = R$ ${fmt(total)}\n`;
    if (item.desconto > 0) txt += `🏷️ Com ${item.desconto}% de desconto aplicado\n`;
    txt += `\n`;
  });
  txt += `${DIV}\n`;
  if (frete > 0) {
    txt += `Subtotal: R$ ${fmt(subtotal)}\n🚚 Frete: R$ ${fmt(frete)}\n${DIV}\n💵 TOTAL: R$ ${fmt(subtotal + frete)}\n`;
  } else {
    txt += `💵 TOTAL: R$ ${fmt(subtotal)}\n`;
  }
  txt += `${DIV}\n\n✅ Pagamento via PIX — sem acréscimo\n\nObrigada pela preferência! 🍱❤️\nAguardando sua confirmação para envio do link de pagamento.`;
  document.getElementById('resumo-texto').textContent = txt;
  openModal('modal-resumo');
  setTimeout(() => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => showToast('✅ Resumo copiado!')).catch(() => {});
    }
  }, 150);
}

function copiarResumo() {
  const txt = document.getElementById('resumo-texto').textContent;
  if (!txt) { showToast('⚠️ Nada para copiar', '#d9534f'); return; }
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); showToast('✅ Resumo copiado!'); closeModal('modal-resumo'); }
    catch(e) { showToast('⚠️ Copie o texto manualmente', '#d9534f'); }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt)
      .then(() => { showToast('✅ Resumo copiado!'); closeModal('modal-resumo'); })
      .catch(fallback);
  } else { fallback(); }
}

// ════════════════════════════════════════════════════════════
//  MODAL HELPERS
// ════════════════════════════════════════════════════════════
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

// ════════════════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════════════════
let _toastTimer = null;
function showToast(msg, bg = '#5B7B4F') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = bg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ════════════════════════════════════════════════════════════
//  FORMATAÇÃO
// ════════════════════════════════════════════════════════════
function fmt(n)  { return (isNaN(n) || !n ? 0 : n).toFixed(2).replace('.', ','); }
function fmt1(n) { return (isNaN(n) || !n ? 0 : n).toFixed(1).replace('.', ','); }

// ════════════════════════════════════════════════════════════
//  SERVICE WORKER
// ════════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  );
}
