import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, updateDoc, deleteDoc,
  onSnapshot, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const col = collection(db, "piadas");

let uid = localStorage.getItem("uidPiadas");
if (!uid) { uid = crypto.randomUUID(); localStorage.setItem("uidPiadas", uid); }

const $ = (id) => document.getElementById(id);
const TIPOS = {
  general: { nome: "Geral", cor: "#FFD23F" },
  "knock-knock": { nome: "Toc-toc", cor: "#FF7A66" },
  programming: { nome: "Programação", cor: "#5EE0A8" },
  dad: { nome: "Tiozão", cor: "#BBA8FF" }
};
const nomeDe = (t) => TIPOS[t]?.nome ?? t;
const corDe = (t) => TIPOS[t]?.cor ?? "#FFFFFF";

let tipoSorteio = "";
let filtroColecao = "";
let piadaAtual = null;
let salvas = [];
let editandoId = null;

function criar(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}
function reiniciar(el, classe) {
  el.classList.remove(classe);
  void el.offsetWidth;
  el.classList.add(classe);
}

function montarGlobo() {
  const cores = Object.values(TIPOS).map((t) => t.cor);
  const total = 15;
  for (let i = 0; i < total; i++) {
    const ang = i * 2.399963;
    const raio = 0.27 * Math.sqrt((i + 0.5) / total);
    const x = 50 + Math.cos(ang) * raio * 100;
    const y = 56 + Math.sin(ang) * raio * 100;
    const c = criar("span", "cap");
    c.style.cssText = `--x:${x}%;--y:${y}%;--c:${cores[i % cores.length]};--r:${((i * 47) % 180) - 90}deg;--d:${(i % 5) * 0.06}s`;
    $("globo").append(c);
  }
}

function ligarChips(el, aoMudar) {
  el.addEventListener("click", (ev) => {
    const botao = ev.target.closest(".chip");
    if (!botao) return;
    el.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === botao)));
    aoMudar(botao.dataset.tipo);
  });
}
ligarChips($("chipsSorteio"), (t) => { tipoSorteio = t; });
ligarChips($("chipsColecao"), (t) => { filtroColecao = t; desenharLista(); });

async function traduzir(texto) {
  const url = "https://api.mymemory.translated.net/get?langpair=en|pt-BR&q=" + encodeURIComponent(texto);
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json();
  const t = j?.responseData?.translatedText;
  if (j.responseStatus !== 200 || !t || /MYMEMORY WARNING/i.test(t)) throw new Error("tradução indisponível");
  return t;
}

async function buscarPiada() {
  const url = tipoSorteio
    ? `https://official-joke-api.appspot.com/jokes/${tipoSorteio}/random`
    : "https://official-joke-api.appspot.com/random_joke";
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  let d = await r.json();
  if (Array.isArray(d)) d = d[0];

  let setup = d.setup, resposta = d.punchline, traduzida = false;
  try {
    [setup, resposta] = await Promise.all([traduzir(d.setup), traduzir(d.punchline)]);
    traduzida = true;
  } catch (e) {
    console.warn("Tradução indisponível, exibindo o original.", e);
  }
  return {
    apiId: d.id, tipo: d.type, setup, resposta,
    setupOriginal: d.setup, respostaOriginal: d.punchline, traduzida
  };
}

function fecharDobra() {
  $("dobra").classList.remove("aberta");
  $("resposta").setAttribute("aria-hidden", "true");
  $("btnRevelar").textContent = "Revelar resposta";
}

async function girar() {
  $("btnGirar").disabled = true;
  $("maquina").classList.add("girando");
  piadaAtual = null;
  $("capSaida").classList.remove("cai");
  $("msgPalco").textContent = "";
  $("tipoAtual").textContent = "Girando…";
  $("setup").textContent = "A máquina está sorteando uma piada…";
  $("resposta").textContent = "";
  fecharDobra();
  $("boxOriginal").hidden = true;
  $("boxOriginal").open = false;
  $("btnRevelar").disabled = true;
  $("btnSalvar").disabled = true;

  const espera = new Promise((ok) => setTimeout(ok, 1000));
  try {
    const [piada] = await Promise.all([buscarPiada(), espera]);
    mostrarPiada(piada);
  } catch (e) {
    console.error(e);
    await espera;
    $("tipoAtual").textContent = "Máquina travada";
    $("setup").textContent = "Não foi possível sortear uma piada agora.";
    $("msgPalco").textContent = "Verifique a conexão e gire a manivela de novo.";
  } finally {
    $("maquina").classList.remove("girando");
    $("btnGirar").disabled = false;
  }
}

function mostrarPiada(p) {
  piadaAtual = p;
  const cor = corDe(p.tipo);
  $("ticket").style.setProperty("--cor", cor);
  $("capSaida").style.setProperty("--cor", cor);
  $("tipoAtual").textContent = nomeDe(p.tipo);
  $("setup").textContent = p.setup;
  $("resposta").textContent = p.resposta;
  $("btnRevelar").disabled = false;
  if (p.traduzida) {
    $("originalSetup").textContent = p.setupOriginal;
    $("originalResposta").textContent = p.respostaOriginal;
    $("boxOriginal").hidden = false;
  } else {
    $("msgPalco").textContent = "A tradução não respondeu agora. Esta piada veio em inglês.";
  }
  reiniciar($("capSaida"), "cai");
  reiniciar($("ticket"), "imprimindo");
  atualizarBotaoSalvar();
}

function atualizarBotaoSalvar() {
  if (!piadaAtual) return;
  const jaSalva = salvas.some((p) => p.apiId === piadaAtual.apiId);
  $("btnSalvar").disabled = jaSalva;
  $("btnSalvar").textContent = jaSalva ? "Já está no pote" : "Guardar no pote";
}

$("btnGirar").addEventListener("click", girar);

$("btnRevelar").addEventListener("click", () => {
  const aberta = $("dobra").classList.toggle("aberta");
  $("resposta").setAttribute("aria-hidden", String(!aberta));
  $("btnRevelar").textContent = aberta ? "Esconder resposta" : "Revelar resposta";
});

$("btnSalvar").addEventListener("click", async () => {
  if (!piadaAtual) return;
  $("btnSalvar").disabled = true;
  try {
    await addDoc(col, { ...piadaAtual, nota: "", origem: "api", uid, criadoEm: serverTimestamp() });
    $("msgPalco").textContent = "Piada guardada no pote.";
  } catch (e) {
    console.error(e);
    $("msgPalco").textContent = "Não foi possível guardar. Confira a configuração do Firebase.";
    $("btnSalvar").disabled = false;
  }
});

function abrirDialogo(p) {
  editandoId = p ? p.id : null;
  $("dlgTitulo").textContent = p ? "Editar piada" : "Nova piada";
  $("btnConfirmar").textContent = p ? "Salvar alterações" : "Cadastrar piada";
  $("fSetup").value = p?.setup ?? "";
  $("fResposta").value = p?.resposta ?? "";
  $("fTipo").value = p && p.tipo in TIPOS ? p.tipo : "general";
  $("fNota").value = p?.nota ?? "";
  $("msgDlg").textContent = "";
  $("dlg").showModal();
}
$("btnNova").addEventListener("click", () => abrirDialogo(null));
$("btnCancelar").addEventListener("click", () => $("dlg").close());

$("formPiada").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const dados = {
    setup: $("fSetup").value.trim(),
    resposta: $("fResposta").value.trim(),
    tipo: $("fTipo").value,
    nota: $("fNota").value.trim()
  };
  try {
    if (editandoId) {
      await updateDoc(doc(db, "piadas", editandoId), { ...dados, atualizadoEm: serverTimestamp() });
    } else {
      await addDoc(col, { ...dados, apiId: null, origem: "manual", uid, criadoEm: serverTimestamp() });
    }
    $("dlg").close();
  } catch (e) {
    console.error(e);
    $("msgDlg").textContent = "Não foi possível salvar. Confira a configuração do Firebase.";
  }
});

onSnapshot(
  query(col, where("uid", "==", uid)),
  (snap) => {
    salvas = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.criadoEm?.seconds ?? 9e9) - (a.criadoEm?.seconds ?? 9e9));
    $("msgLista").textContent = "";
    $("numPote").textContent = salvas.length;
    desenharLista();
    atualizarBotaoSalvar();
  },
  (erro) => {
    console.error(erro);
    $("msgLista").textContent = "Não foi possível ler o pote. Confira as regras e a configuração do Firestore.";
  }
);

function desenharLista() {
  const itens = salvas.filter((p) => !filtroColecao || p.tipo === filtroColecao);
  $("tituloColecao").textContent = filtroColecao ? `Meu pote (${itens.length})` : "Meu pote";
  const ul = $("lista");
  ul.replaceChildren();

  if (!itens.length) {
    ul.append(criar("li", "vazio", salvas.length
      ? "Nenhuma piada deste tipo no pote. Escolha outro filtro."
      : "O pote está vazio. Gire a manivela e guarde a primeira piada."));
    return;
  }

  for (const p of itens) {
    const li = criar("li", "carta");
    li.style.setProperty("--cor", corDe(p.tipo));

    const corpo = criar("div", "carta-corpo");
    corpo.append(criar("p", "carta-setup", p.setup), criar("p", "carta-resposta", p.resposta));
    if (p.nota) corpo.append(criar("small", "", "Anotação: " + p.nota));

    const acoes = criar("div", "carta-acoes");
    const editar = criar("button", "botao mini", "Editar");
    editar.type = "button";
    editar.addEventListener("click", () => abrirDialogo(p));
    const excluirBtn = criar("button", "botao mini perigo", "Excluir");
    excluirBtn.type = "button";
    excluirBtn.addEventListener("click", () => excluir(p));
    acoes.append(editar, excluirBtn);

    li.append(criar("div", "carta-topo", nomeDe(p.tipo)), corpo, acoes);
    ul.append(li);
  }
}

async function excluir(p) {
  if (!confirm("Excluir esta piada do pote?")) return;
  try {
    await deleteDoc(doc(db, "piadas", p.id));
  } catch (e) {
    console.error(e);
    $("msgLista").textContent = "Não foi possível excluir a piada.";
  }
}

montarGlobo();