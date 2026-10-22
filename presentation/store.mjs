import { Store, fresh, readState, PRODUCTS, rules } from "./lib/store.mjs";
const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (cents) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
const time = (date) =>
  new Date(date).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
let busy = false,
  diagnosis = null,
  testReport = null,
  storageAvailable = true,
  timer;
const icons = {
  headphones:
    '<path d="M28 83V60a32 32 0 0 1 64 0v23" fill="none" stroke="#665f83" stroke-width="12"/><rect x="20" y="60" width="20" height="38" rx="8" fill="#9186b1"/><rect x="80" y="60" width="20" height="38" rx="8" fill="#9186b1"/><path d="M30 41a34 34 0 0 1 58-2" fill="none" stroke="#c0b7da" stroke-width="4"/>',
  keyboard:
    '<rect x="6" y="35" width="110" height="56" rx="7" fill="#b79d80"/><rect x="9" y="32" width="104" height="52" rx="6" fill="#e1ccb2"/><path d="M18 43h87M18 55h87M18 67h87M27 38v33M42 38v33M57 38v22M72 38v22M87 38v33M102 38v33" stroke="#af967b" stroke-width="6"/><path d="M44 72h35" stroke="#f9efdc" stroke-width="7"/>',
  speaker:
    '<rect x="31" y="17" width="58" height="88" rx="18" fill="#456b56"/><rect x="35" y="20" width="50" height="80" rx="15" fill="#87a58c"/><circle cx="60" cy="60" r="20" fill="#52785f"/><circle cx="60" cy="60" r="14" fill="#6d9277"/><path d="M48 30h24" stroke="#d0e2cb" stroke-width="4" stroke-linecap="round"/>',
};
$("#product-list").innerHTML = PRODUCTS.map(
  (p) =>
    `<article class="product"><div class="product-art ${p.color}"><svg viewBox="0 0 120 120" aria-hidden="true">${icons[p.icon]}</svg></div><span class="product-category">${p.category}</span><h3>${p.name}</h3><p class="product-description">${p.description}</p><div class="product-bottom"><strong>${money(p.price)}</strong><button class="add-btn" data-add="${p.id}" aria-label="Adicionar ${p.name} ao carrinho">+</button></div></article>`,
).join("");
function toast(message) {
  clearTimeout(timer);
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  timer = setTimeout(() => ($("#toast").hidden = true), 6500);
}
async function call(body) {
  const response = await fetch("/api/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "A API não respondeu em JSON. Confira se este deploy contém as funções /api.",
    );
  }
  return { status: response.status, data };
}
let saved;
try {
  saved = readState(localStorage);
} catch {
  saved = fresh();
  storageAvailable = false;
}
const store = new Store({
  state: saved,
  call,
  persist: (state) => {
    try {
      localStorage.setItem("nexo-demo-v1", JSON.stringify(state));
    } catch {
      storageAvailable = false;
    }
  },
  changed: () => render(),
});
function render() {
  const s = store.state,
    blocked = s.breaker !== "closed",
    unknown = s.attempt?.unknown;
  $("#cart-count").textContent = s.cart.reduce((n, i) => n + i.quantity, 0);
  $("#cart-total").textContent = money(store.total());
  $("#cart-items").innerHTML = s.cart.length
    ? s.cart
        .map((item) => {
          const p = PRODUCTS.find((p) => p.id === item.id);
          return `<div class="cart-item"><div><h4>${p.name}</h4><small>${item.quantity} un. × ${money(p.price)}</small></div><button class="remove" data-remove="${p.id}" aria-label="Remover ${p.name}">×</button></div>`;
        })
        .join("")
    : '<div class="empty-cart"><span>⌑</span>Seu próximo favorito começa aqui.<br>Adicione um produto à coleção.</div>';
  $("#checkout").disabled = busy || !s.cart.length || blocked || unknown;
  $("#checkout").innerHTML = unknown
    ? "Pagamento pendente de consulta"
    : blocked
      ? "Pagamento temporariamente suspenso"
      : "Finalizar compra de teste <span>→</span>";
  $("#reconcile").hidden = !unknown;
  $("#reconcile").disabled = busy;
  $("#payment-notice").hidden = !blocked && !unknown;
  $("#payment-notice").innerHTML = unknown
    ? "<p><strong>Não tente pagar novamente.</strong> A resposta é desconhecida. Consulte a tentativa pendente; seus itens estão preservados.</p>"
    : `<p>O processamento de pagamentos está temporariamente indisponível. Seus itens continuam salvos. Deseja receber um aviso quando voltar?</p>${s.subscription?.incident === s.incident ? "<strong>Aviso solicitado. Acompanhe a recuperação nesta página.</strong>" : '<button id="subscribe">Quero receber um aviso</button>'}`;
  $("#payment-status").textContent = unknown
    ? "Resultado desconhecido"
    : blocked
      ? "Indisponível"
      : s.scenario === "declined"
        ? "Ativo · recusa de teste"
        : s.scenario === "slow"
          ? "Timeout preparado"
          : s.evidence.some(
                (e) => e.event === "payment_probe" || e.event === "payment_pay",
              )
            ? "Disponível"
            : "Não verificado";
  $("#payment-dot").className =
    "status-dot " + (blocked || unknown ? "bad" : "ok");
  $("#circuit-status").textContent = {
    open: "Aberto · compra protegida",
    "half-open": "Validando recuperação",
    closed: "Fechado · compra liberada",
  }[s.breaker];
  $("#circuit-dot").className = "status-dot " + (blocked ? "bad" : "ok");
  $("#notifications").innerHTML = s.notices
    .slice(-3)
    .map(
      (n) =>
        `<div class="notification"><span>✓</span><div><b>Você já pode continuar.</b> ${esc(n.text)}<small>Aviso interno solicitado · ${time(n.at)} · nenhuma mensagem externa enviada</small></div></div>`,
    )
    .join("");
  $("#order-result").innerHTML = s.orders.length
    ? `<div class="order-success"><b>Compra de teste confirmada ✓</b><br>${esc(s.orders.at(-1).receiptId)}<br>${money(s.orders.at(-1).total)} · nenhum valor foi cobrado</div>`
    : "";
  $("#event-count").textContent = `${s.evidence.length} eventos`;
  $("#timeline").innerHTML = s.evidence.length
    ? s.evidence
        .slice()
        .reverse()
        .map(
          (e) =>
            `<article class="event" id="event-${esc(e.id)}"><time>${time(e.timestamp)}</time><div><b>${esc(e.event)}</b><p>${esc(e.details)}</p><code>${esc(e.id)}</code></div>${e.status ? `<span class="http ${e.status >= 400 ? "bad" : ""}">${esc(e.status)}</span>` : ""}</article>`,
        )
        .join("")
    : '<p class="empty-cart">As evidências da sua sessão aparecerão aqui.</p>';
  document.querySelectorAll("[data-scenario]").forEach((button) => {
    button.classList.toggle("active", button.dataset.scenario === s.scenario);
    button.disabled = busy || unknown;
    button.setAttribute("aria-pressed", button.dataset.scenario === s.scenario);
  });
  document
    .querySelectorAll("[data-add],[data-remove]")
    .forEach((button) => (button.disabled = busy || unknown));
  for (const id of ["recover", "analyze", "run-tests"])
    $("#" + id).disabled = busy || (id === "recover" && unknown);
  $("#export").disabled = busy;
  if (diagnosis) {
    $("#diagnosis-mode").textContent =
      diagnosis.mode === "llm"
        ? `LLM real · ${diagnosis.model}`
        : "Por regras · sem IA";
    $("#diagnosis-summary").textContent = diagnosis.summary;
    $("#diagnosis-refs").innerHTML =
      `<div class="refs">${diagnosis.evidence_ids.map((id) => `<a class="ref" href="#event-${esc(id)}" title="${esc(id)}">${esc(id.slice(0, 8))} ↗</a>`).join("")}</div>`;
  }
  if (!storageAvailable)
    $("#status-explanation").textContent =
      "Armazenamento indisponível neste navegador. Os itens desta sessão podem se perder ao recarregar.";
}
async function action(fn) {
  if (busy) return;
  busy = true;
  render();
  try {
    await fn();
  } catch (error) {
    toast(error.message);
  } finally {
    busy = false;
    render();
  }
}
$("#product-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-add]");
  if (b)
    action(() => {
      store.add(b.dataset.add);
      toast(
        store.state.breaker === "closed"
          ? "Item adicionado. Seu carrinho está salvo neste navegador."
          : "Item adicionado. O pagamento está indisponível, mas seu carrinho está salvo.",
      );
    });
});
$("#cart-items").addEventListener("click", (e) => {
  const b = e.target.closest("[data-remove]");
  if (b) action(() => store.remove(b.dataset.remove));
});
$("#payment-notice").addEventListener("click", (e) => {
  if (e.target.closest("#subscribe"))
    action(() => {
      store.subscribe();
      toast(
        "Combinado. Você receberá um aviso aqui quando a recuperação for confirmada.",
      );
    });
});
$("#checkout").addEventListener("click", () =>
  action(async () => {
    await store.checkout();
    toast("Compra de teste concluída. Nenhum valor foi cobrado.");
  }),
);
$("#reconcile").addEventListener("click", () =>
  action(async () => {
    await store.reconcile();
    toast(
      "Resultado consultado: pagamento de teste confirmado, sem criar outra tentativa.",
    );
  }),
);
document.querySelectorAll("[data-scenario]").forEach((b) =>
  b.addEventListener("click", () =>
    action(async () => {
      await store.scenario(b.dataset.scenario);
      diagnosis = rules(store.state.evidence);
      toast("Cenário aplicado e resposta da API registrada.");
    }),
  ),
);
$("#recover").addEventListener("click", () =>
  action(async () => {
    if (await store.scenario("normal"))
      toast("Pagamento restaurado e verificado. Sua compra pode continuar.");
    diagnosis = rules(store.state.evidence);
  }),
);
$("#analyze").addEventListener("click", () =>
  action(async () => {
    const evidence = store.state.evidence.slice(-32),
      token = $("#llm-token").value.trim();
    if (!token) {
      diagnosis = rules(evidence);
      toast("Análise por regras concluída. Nenhuma LLM foi consultada.");
      return;
    }
    try {
      const response = await fetch("/api/diagnose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ evidence }),
        signal: AbortSignal.timeout(25000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Falha ao consultar a LLM.");
      diagnosis = data;
      store.event(
        "llm_diagnosis_received",
        200,
        `Modelo: ${data.model}; análise sem execução de ações`,
      );
      toast("Diagnóstico da LLM recebido e referências validadas.");
    } catch (error) {
      diagnosis = rules(evidence);
      toast(`${error.message} Exibindo análise por regras, sem IA.`);
    }
  }),
);
export async function evaluate(api = call) {
  const results = [],
    evidence = [];
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  async function test(name, fn) {
    const start = performance.now();
    try {
      await fn();
      results.push({
        name,
        passed: true,
        durationMs: Math.round(performance.now() - start),
      });
    } catch (error) {
      results.push({ name, passed: false, error: error.message });
    }
  }
  const make = () => new Store({ call: api });
  await test("Compra normal retorna HTTP 200 e comprovante", async () => {
    const s = make();
    s.add("headphones");
    const r = await s.checkout();
    check(
      r.total === 18990 && !s.state.cart.length,
      "Total ou conclusão incorretos",
    );
    evidence.push(...s.state.evidence);
  });
  await test("Falha técnica retorna HTTP 503 sem perder o carrinho", async () => {
    const s = make();
    s.add("keyboard");
    s.state.scenario = "outage";
    try {
      await s.checkout();
    } catch {}
    check(
      s.state.evidence.some((e) => e.status === 503) &&
        s.state.cart.length === 1,
      "Falha HTTP ou preservação não comprovadas",
    );
    evidence.push(...s.state.evidence);
  });
  await test("Circuito aberto evita uma nova chamada de pagamento", async () => {
    const s = make();
    s.add("speaker");
    await s.scenario("outage");
    const count = s.state.evidence.filter(
      (e) => e.event === "payment_pay",
    ).length;
    try {
      await s.checkout();
    } catch {}
    check(
      s.state.evidence.some((e) => e.event === "checkout_blocked") &&
        count ===
          s.state.evidence.filter((e) => e.event === "payment_pay").length,
      "Checkout não foi protegido",
    );
    evidence.push(...s.state.evidence);
  });
  await test("Carrinho sobrevive à restauração do estado salvo", async () => {
    const s = make();
    s.add("keyboard");
    const restored = readState({ getItem: () => JSON.stringify(s.state) });
    check(
      restored.cart[0].quantity === 1 && restored.cart[0].id === "keyboard",
      "Carrinho não restaurado",
    );
  });
  await test("Duas sondagens de recuperação e um único aviso", async () => {
    const s = make();
    s.add("speaker");
    await s.scenario("outage");
    s.subscribe();
    const before = s.state.evidence.length;
    await s.scenario("normal");
    await s.scenario("normal");
    check(
      s.state.notices.length === 1 &&
        s.state.breaker === "closed" &&
        s.state.cart.length === 1 &&
        s.state.evidence
          .slice(before)
          .filter((e) => e.event === "payment_probe" && e.status === 200)
          .length >= 2,
      "Recuperação ou aviso incorretos",
    );
    evidence.push(...s.state.evidence);
  });
  await test("Recusa HTTP 402 mantém o circuito fechado", async () => {
    const s = make();
    s.add("headphones");
    await s.scenario("declined");
    try {
      await s.checkout();
    } catch {}
    check(
      s.state.breaker === "closed" &&
        s.state.evidence.some((e) => e.status === 402) &&
        s.state.cart.length === 1,
      "Recusa confundida com falha técnica",
    );
    evidence.push(...s.state.evidence);
  });
  await test("Timeout bloqueia nova tentativa até reconciliação", async () => {
    const s = make();
    s.add("keyboard");
    await s.scenario("slow");
    try {
      await s.checkout();
    } catch {}
    const id = s.state.attempt.id;
    try {
      await s.checkout();
    } catch {}
    check(
      s.state.attempt.unknown &&
        s.state.evidence.filter((e) => e.event === "payment_pay").length === 1,
      "Nova tentativa indevida",
    );
    const r = await s.reconcile();
    check(
      r.attemptId === id && s.state.orders.length === 1 && !s.state.cart.length,
      "Reconciliação não comprovada",
    );
    evidence.push(...s.state.evidence);
  });
  await test("Mesma chave produz o mesmo comprovante de teste", async () => {
    const body = {
      operation: "pay",
      scenario: "normal",
      attemptId: crypto.randomUUID(),
      items: [{ id: "speaker", quantity: 1 }],
    };
    const a = await api(body),
      b = await api(body);
    check(
      a.status === 200 &&
        b.status === 200 &&
        a.data.receiptId === b.data.receiptId,
      "Comprovantes divergiram",
    );
  });
  return {
    executedAt: new Date().toISOString(),
    scope:
      "Avaliação funcional do sandbox; não mede acurácia de IA, pagamentos reais ou durabilidade de transações.",
    results,
    evidence,
  };
}
$("#run-tests").addEventListener("click", () =>
  action(async () => {
    $("#test-results").hidden = false;
    $("#test-results").innerHTML =
      '<div class="test-report"><h3>Executando avaliação pela API…</h3><p>Seu carrinho não será alterado.</p></div>';
    testReport = await evaluate();
    const passed = testReport.results.filter((r) => r.passed).length;
    $("#test-results").innerHTML =
      `<div class="test-report"><h3>${passed}/${testReport.results.length} verificações aprovadas</h3>${testReport.results.map((r) => `<div class="test-row ${r.passed ? "" : "fail"}"><span>${esc(r.name)}</span><small>${r.passed ? "✓ Aprovado" : "✕ " + esc(r.error)}</small></div>`).join("")}<p>Amostra desta execução, usando cenários controlados. Não é teste de carga nem avaliação de acurácia da IA. Resultados disponíveis na exportação.</p></div>`;
    toast("Avaliação concluída. Confira os resultados observados.");
  }),
);
$("#export").addEventListener("click", () => {
  const report = {
    artifact: "Nexo · Pesquisa Aplicada",
    version: "2.0.0",
    exportedAt: new Date().toISOString(),
    scope:
      "Sandbox serverless, carrinho e evidências locais neste navegador. Nenhuma cobrança real, envio externo ou reparo por IA.",
    state: store.state,
    diagnosis,
    evaluation: testReport,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `nexo-evidencias-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
render();
