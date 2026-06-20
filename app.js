// ════════════════════════════════════════════════════════════
//  STORAGE
// ════════════════════════════════════════════════════════════
const LS = {
  get: k    => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k,v) => localStorage.setItem(k, JSON.stringify(v))
};
const LS_INGR    = 'vf_ingredientes';
const LS_SALVAS  = 'vf_salvas';
const LS_CART    = 'vf_cart';
const LS_MODELOS = 'vf_modelos';
const LS_FRETE   = 'vf_frete';

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
  { id: uid(), nome: 'Pote',              preco: 167,  qtd: 144, unidade: 'unidade' },
  { id: uid(), nome: 'Rótulo/Etiqueta',   preco: 85,   qtd: 300, unidade: 'unidade' },
];

// ════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════
let ingredientes   = LS.get(LS_INGR)     || DEFAULT_INGR;
let salvas         = LS.get(LS_SALVAS)   || [];
let cart           = LS.get(LS_CART)     || [];
let modelos        = LS.get(LS_MODELOS)  || [];
let frete          = R(LS.get(LS_FRETE)) || 0;
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

/**
 * Calcula o preço de venda BASE (sem desconto) para uma margem alvo.
 *
 * custo_efetivo = custo_base × (1 + imposto/100)
 * precoBase     = custo_efetivo / ((1−M) × (1−taxa/100))
 * receita_liq   = precoBase × (1 − taxa/100)
 * lucro         = receita_liq − custo_efetivo
 * margemReal    ≈ M (confirmação)
 *
 * O desconto NÃO entra aqui — ele é aplicado SOBRE o precoBase depois.
 * Assim o preço normal não sobe para "compensar" o desconto.
 */
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

/**
 * Aplica desconto sobre o preço base e calcula o novo lucro/margem real.
 * Retorna null se desconto === 0.
 */
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

// Custo real de um modelo com preços atuais dos ingredientes
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
    // Sem modelos: expande a seção customizada automaticamente
    setCustomOpen(true);
    return;
  }
  hint.style.display = 'none';

  scroll.innerHTML = modelos.map(m => {
    const custo = custoModelo(m);
    const preco = calcPreco(custo, 60, 0, 0).precoBase;
    return `
    <div class="modelo-card" onclick="usarModelo('${m.id}')">
      <button class="modelo-card-del" onclick="event.stopPropagation();apagarModelo('${m.id}')">🗑️</button>
      <div class="modelo-card-nome">${m.nome}</div>
      <div class="modelo-card-preco">R$ ${fmt(preco)}</div>
      <div class="modelo-card-sub">60% margem · toque para usar</div>
    </div>`;
  }).join('');

  // Com modelos: colapsa a seção customizada por padrão
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

  // Carrega ingredientes do modelo na seleção
  selection = {};
  (m.ingrs || []).forEach(i => { selection[i.id] = { qtd: i.qtd }; });

  setCustomOpen(true);   // mostra ingredientes carregados
  renderMontar();
  updatePriceBar();

  // Abre o calculador com o nome do modelo já preenchido
  setTimeout(() => {
    document.getElementById('modal-pedido-nome').value = m.nome;
    openMargensModal();
  }, 80);

  showToast(`⭐ "${m.nome}" carregado!`);
}

function apagarModelo(id) {
  if (!confirm('Apagar este modelo?')) return;
  modelos = modelos.filter(m => m.id !== id);
  LS.set(LS_MODELOS, modelos);
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

  modelos.unshift({
    id: uid(), nome, ingrs: ingrsSnap,
    criadoEm: new Date().toLocaleDateString('pt-BR')
  });
  LS.set(LS_MODELOS, modelos);
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

  list.innerHTML = ingredientes.map(i => {
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
  LS.set(LS_INGR, ingredientes);
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
  LS.set(LS_INGR, ingredientes);
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

  list.innerHTML = ingredientes.map(ingr => {
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
    document.getElementById('pb-label').textContent = 'Preço sugerido (60% de margem)';
    return;
  }
  const r = calcPreco(custo, 60, 0, 0);
  document.getElementById('pb-price-val').textContent = 'R$ ' + fmt(r.precoBase);
  document.getElementById('pb-label').textContent = 'Preço sugerido (60% de margem)';
}

// ════════════════════════════════════════════════════════════
//  MODAL MARGENS — abrir
// ════════════════════════════════════════════════════════════
function openMargensModal() {
  const custo = custoTotal();

  // resumo dos ingredientes
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

  // pré-preenche nome da marmita
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
//  MODAL MARGENS — atualização em tempo real
// ════════════════════════════════════════════════════════════
function updateModalCalc() {
  const custo      = custoTotal();
  const qtd        = Math.max(1, parseInt(document.getElementById('modal-qtd').value) || 1);
  const taxa       = R(document.getElementById('modal-taxa').value);
  const imposto    = R(document.getElementById('modal-imposto').value);
  const desconto   = R(document.getElementById('modal-desconto').value);
  const margemAlvo = parseInt(document.getElementById('modal-margem-alvo').value) || 60;

  // label do slider
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

  // preço base (sem desconto)
  const r = calcPreco(custo, margemAlvo, taxa, imposto);

  document.getElementById('rc-preco').textContent         = 'R$ ' + fmt(r.precoBase);
  document.getElementById('rc-lucro-unit').textContent    = 'R$ ' + fmt(r.lucro);
  document.getElementById('rc-margem-real').textContent   = fmt1(r.margemReal) + '%';
  document.getElementById('rc-custo-efetivo').textContent = 'R$ ' + fmt(r.custoEfetivo);
  document.getElementById('rc-lucro-label').textContent   = 'Lucro / marmita';

  // desconto: mostra preço normal → preço com desconto (sem inflacionar)
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

  // bloco de quantidade — usa o preço com desconto se houver
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

  // tabela comparativa — sempre sem desconto (preços normais de referência)
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
//  MODAL SALVAR MARMITA
// ════════════════════════════════════════════════════════════
function openSaveModal() {
  if (custoTotal() === 0) {
    showToast('⚠️ Adicione ingredientes com quantidade', '#d9534f'); return;
  }
  document.getElementById('salvar-nome').value = '';
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
  LS.set(LS_SALVAS, salvas);
  closeModal('modal-salvar');
  showToast(`✅ "${nome}" salva!`);
}

// ════════════════════════════════════════════════════════════
//  SALVAS
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

function reabrirMarmita(id) {
  const s = salvas.find(x => x.id === id);
  if (!s) return;
  selection = {};
  s.itens.forEach(i => { selection[i.id] = { qtd: i.qtd }; });
  showScreen('montar', document.querySelector('nav button'));
  showToast(`🍽️ "${s.nome}" reaberta!`);
}

// Carrega ingredientes do cliente E abre o modal de cálculo direto
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
  LS.set(LS_SALVAS, salvas);
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

  // ingrs no formato do carrinho (com id)
  const ingrs = (s.itens || []).map(i => ({ id: i.id, nome: i.nome, qtd: i.qtd, unidade: i.unidade }));
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
  LS.set(LS_CART, cart);
  updateCartBadge();
  closeModal('modal-edit-salva');
  showToast(`✅ "${nome}" adicionada ao pedido!`);
}

function apagarSalva(id) {
  if (!confirm('Apagar marmita salva?')) return;
  salvas = salvas.filter(s => s.id !== id);
  LS.set(LS_SALVAS, salvas);
  renderSalvas();
  showToast('🗑️ Apagada');
}

// ════════════════════════════════════════════════════════════
//  PEDIDO — adicionar ao carrinho
// ════════════════════════════════════════════════════════════
function addToPedido() {
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

  // precoUnit = preço que o cliente paga (com desconto se houver)
  const precoUnit = disc ? disc.precoFinal : r.precoBase;
  const lucroUnit = disc ? disc.lucro      : r.lucro;
  const margemReal = disc ? disc.margemReal : r.margemReal;

  // snapshot dos ingredientes (com id para permitir edição futura)
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
    showToast(`✅ "${nome}" atualizada no pedido!`);
  } else {
    cart.push(novoItem);
    showToast(`✅ "${nome}" adicionada ao pedido!`);
  }

  LS.set(LS_CART, cart);
  updateCartBadge();
  document.getElementById('modal-pedido-nome').value = '';
  closeModal('modal-margens');
}

// ════════════════════════════════════════════════════════════
//  PEDIDO — editar item do carrinho
// ════════════════════════════════════════════════════════════
function editCartItem(idx) {
  const item = cart[idx];
  if (!item) return;

  // Restaura a seleção de ingredientes do snapshot
  selection = {};
  (item.ingrs || []).forEach(i => { selection[i.id] = { qtd: i.qtd }; });

  // Vai para a tela Montar com ingredientes carregados
  showScreen('montar', document.querySelector('nav button'));

  editingCartIdx = idx;

  setTimeout(() => {
    // Pré-preenche campos do modal
    document.getElementById('modal-pedido-nome').value  = item.nome;
    document.getElementById('modal-qtd').value          = item.qtdMarmitas;
    document.getElementById('modal-taxa').value         = item.taxa    || 0;
    document.getElementById('modal-imposto').value      = item.imposto || 0;
    document.getElementById('modal-desconto').value     = item.desconto || 0;
    document.getElementById('modal-margem-alvo').value  = item.margemAlvo || 60;

    // Muda botão para modo edição
    document.getElementById('btn-add-pedido').textContent  = '💾 Salvar edição';
    document.getElementById('btn-cancel-edit').style.display = 'block';

    openMargensModal();
  }, 120);
}

function cancelEditCart() {
  editingCartIdx = null;
  resetAddBtn();
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
  LS.set(LS_FRETE, frete);
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
  const list   = document.getElementById('cart-list');
  const empty  = document.getElementById('cart-empty');
  const totBox = document.getElementById('cart-order-total');
  const actBox = document.getElementById('cart-actions');

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
  LS.set(LS_CART, cart);
  updateCartBadge();
  renderPedido();
  showToast('🗑️ Item removido');
}

function limparPedido() {
  if (!confirm('Limpar todo o pedido?')) return;
  cart = [];
  LS.set(LS_CART, cart);
  updateCartBadge();
  renderPedido();
  showToast('🗑️ Pedido limpo');
}

function updateCartBadge() {
  const tab = document.getElementById('tab-pedido');
  const n   = cart.length;
  const old = tab.querySelector('.tab-badge');
  if (old) old.remove();
  if (n > 0) tab.innerHTML = `📋<span class="tab-badge">${n}</span><br>Pedido`;
  else        tab.innerHTML = `📋<br>Pedido`;
}

// ════════════════════════════════════════════════════════════
//  RESUMO DO PEDIDO
// ════════════════════════════════════════════════════════════
// Palavras-chave de embalagem — excluídas do resumo do cliente
const EMBALAGEM = ['pote', 'rótulo', 'etiqueta', 'embalagem', 'tampa', 'saco', 'bandeja'];

function isFoodItem(ingr) {
  const n = (ingr.nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  return !EMBALAGEM.some(kw => n.includes(kw.normalize('NFD').replace(/[̀-ͯ]/g,'')));
}

function formatIngredientQty(ingr) {
  if (ingr.unidade === 'kg') return `${Math.round(ingr.qtd * 1000)}g`;
  if (ingr.unidade === 'g')  return `${ingr.qtd}g`;
  return `${ingr.qtd}`;
}

function openResumoModal() {
  if (!cart.length) { showToast('⚠️ Pedido está vazio', '#d9534f'); return; }

  const hoje = new Date().toLocaleDateString('pt-BR');
  const div  = '─'.repeat(36);
  let txt = `🍱 ORÇAMENTO — Sabor da Vó Fátima\n`;
  txt    += `Data: ${hoje}\n`;
  txt    += `${div}\n\n`;

  let subtotal = 0;

  cart.forEach(item => {
    const total = item.precoUnit * item.qtdMarmitas;
    subtotal   += total;

    txt += `🍱 ${item.nome}\n`;

    // Ingredientes alimentícios (sem pote/etiqueta e sem preço)
    const foodIngrs = (item.ingrs || []).filter(isFoodItem);
    if (foodIngrs.length) {
      const ingrStr = foodIngrs.map(i => `${i.nome} ${formatIngredientQty(i)}`).join(' · ');
      txt += `   ${ingrStr}\n`;
    }

    txt += `   ${item.qtdMarmitas} marmita${item.qtdMarmitas > 1 ? 's' : ''} × R$ ${fmt(item.precoUnit)} = R$ ${fmt(total)}\n`;
    if (item.desconto > 0) txt += `   🏷️ Desconto de ${item.desconto}% aplicado\n`;
    txt += `\n`;
  });

  txt += `${div}\n`;
  if (frete > 0) {
    txt += `Subtotal:  R$ ${fmt(subtotal)}\n`;
    txt += `🚚 Frete:  R$ ${fmt(frete)}\n`;
    txt += `${div}\n`;
    txt += `TOTAL: R$ ${fmt(subtotal + frete)}\n`;
  } else {
    txt += `TOTAL: R$ ${fmt(subtotal)}\n`;
  }
  txt += `${div}\n\n`;

  txt += `💳 FORMAS DE PAGAMENTO\n`;
  txt += `✅ PIX — sem nenhum acréscimo\n`;
  txt += `✅ Débito — sem nenhum acréscimo\n`;
  txt += `💳 Crédito — com repasse da taxa operacional\n`;
  txt += `   (confirmamos o valor exato no fechamento,\n`;
  txt += `    sem surpresas!)\n\n`;

  txt += `Obrigada pela preferência! 🍱❤️\n`;
  txt += `Aguardando sua confirmação para envio do link de pagamento.`;

  document.getElementById('resumo-texto').textContent = txt;
  openModal('modal-resumo');
}

function copiarResumo() {
  const txt = document.getElementById('resumo-texto').textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(txt).then(() => showToast('✅ Texto copiado!'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('✅ Texto copiado!');
  }
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
//  INIT
// ════════════════════════════════════════════════════════════
renderModelos();
renderMontar();
updatePriceBar();
updateCartBadge();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  );
}
