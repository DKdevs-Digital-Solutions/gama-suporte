'use client';

import { useEffect, useMemo, useState } from 'react';

const STEP_LABELS = ['Dados', 'Produtos', 'Descrição', 'Contato', 'Revisão'];

function formatBRL(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return '-';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function onlyDigits(str) {
  return String(str || '').replace(/\D/g, '');
}

function isValidEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(str || '').trim());
}

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const err = new Error(body.mensagem || body.message || 'Erro inesperado.');
    err.status = res.status;
    throw err;
  }
  return body;
}

export default function CheckoutWizard({ token }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState({});
  const [descricaoExtra, setDescricaoExtra] = useState('');
  const [contatos, setContatos] = useState([]);
  const [contatosLoaded, setContatosLoaded] = useState(false);
  const [contatoSelecionado, setContatoSelecionado] = useState(null);
  const [usandoNovoContato, setUsandoNovoContato] = useState(false);
  const [novoContato, setNovoContato] = useState({ nome_contato: '', celular: '', email: '', telefone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [jaConcluido, setJaConcluido] = useState(false);
  const [fecharEmSegundos, setFecharEmSegundos] = useState(30);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const body = await api(`/api/checkout/${token}`);
        if (cancelado) return;
        if (body.jaConcluido) {
          setData(body);
          setJaConcluido(true);
          setResultado(body.chamado);
        } else {
          // A API devolve codprod/qt/valores como string em vez de número - normaliza uma
          // vez aqui pra todo o resto do wizard poder comparar/somar com segurança.
          const produtos = body.produtos.map((p) => ({
            ...p,
            codprod: Number(p.codprod),
            qt: Number(p.qt),
            valor_nf_unit: Number(p.valor_nf_unit),
            valor_nf_total: Number(p.valor_nf_total),
          }));
          setData({ ...body, produtos });
          const inicial = {};
          produtos.forEach((p) => {
            inicial[p.codprod] = { marcado: false, preco: '' };
          });
          setSelected(inicial);
        }
      } catch (err) {
        if (cancelado) return;
        setError(err.status === 410 ? err.message : 'Não foi possível carregar seus dados agora. Tente novamente em instantes.');
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [token]);

  // Depois que o chamado é aberto, fecha a janela sozinha em 30s (best-effort: alguns
  // navegadores só permitem window.close() em abas abertas por script).
  useEffect(() => {
    if (!resultado) return undefined;
    setFecharEmSegundos(30);
    const interval = setInterval(() => {
      setFecharEmSegundos((s) => {
        if (s <= 1) {
          clearInterval(interval);
          try { window.close(); } catch { /* navegador bloqueou o fechamento automático */ }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [resultado]);

  const produtosSelecionados = useMemo(() => {
    return Object.keys(selected)
      .map((codprod) => ({ codprod: Number(codprod), ...selected[codprod] }))
      .filter((item) => item.marcado);
  }, [selected]);

  function stepValido(idx) {
    if (idx === 0) return true;
    if (idx === 1) {
      if (produtosSelecionados.length === 0) return false;
      return produtosSelecionados.every((item) => {
        const v = Number(String(item.preco).replace(',', '.'));
        return item.preco !== '' && !Number.isNaN(v) && v >= 0;
      });
    }
    if (idx === 2) return true;
    if (idx === 3) {
      if (usandoNovoContato) {
        return novoContato.nome_contato.trim().length > 0 && onlyDigits(novoContato.celular).length >= 10 && isValidEmail(novoContato.email);
      }
      return !!contatoSelecionado;
    }
    return true;
  }

  function descricaoFinal() {
    const linhas = produtosSelecionados.map((item) => {
      const prod = data.produtos.find((p) => p.codprod === item.codprod);
      const precoCorreto = Number(String(item.preco).replace(',', '.'));
      return `- ${prod.produto}: cobrado a ${formatBRL(prod.valor_nf_unit)}, preço correto informado ${formatBRL(precoCorreto)} (qtd ${prod.qt}).`;
    });
    let base = `Cliente relata divergência de preço nos itens da nota ${data.numnota || data.numped}:\n${linhas.join('\n')}`;
    if (descricaoExtra.trim()) {
      base += `\n\nObservações do cliente: ${descricaoExtra.trim()}`;
    }
    return base;
  }

  // Busca a lista de contatos do cliente uma única vez (cache em `contatos`); usada
  // pra localizar o contato pelo e-mail que a pessoa informar na etapa 4.
  async function garantirContatosCarregados() {
    if (contatosLoaded) return contatos;
    try {
      const body = await api(`/api/checkout/${token}/contatos`);
      const lista = body.data || [];
      setContatos(lista);
      return lista;
    } catch {
      return [];
    } finally {
      setContatosLoaded(true);
    }
  }

  function goNext() {
    if (stepIndex === STEP_LABELS.length - 1) return submit();
    if (!stepValido(stepIndex)) return;
    if (stepIndex === 2) garantirContatosCarregados();
    setStepIndex((i) => i + 1);
  }

  function goBack() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  async function garantirContatoId() {
    if (!usandoNovoContato) return contatoSelecionado;
    const body = await api(`/api/checkout/${token}/contatos`, {
      method: 'POST',
      body: JSON.stringify({
        nome_contato: novoContato.nome_contato.trim(),
        celular: onlyDigits(novoContato.celular),
        email: novoContato.email.trim(),
        telefone: novoContato.telefone ? onlyDigits(novoContato.telefone) : undefined,
      }),
    });
    return body.contato.id;
  }

  async function submit() {
    if (!stepValido(3) || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const contatoId = await garantirContatoId();
      const produtosPayload = produtosSelecionados.map((item) => {
        const prod = data.produtos.find((p) => p.codprod === item.codprod);
        return {
          codprod: prod.codprod,
          produto: prod.produto,
          qt: prod.qt,
          valor_nf_unit: prod.valor_nf_unit,
          quantidade_ocorrencia: prod.qt,
          valor_ocorrencia: Number(String(item.preco).replace(',', '.')),
        };
      });

      const body = await api(`/api/checkout/${token}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          descricao_chamado: descricaoFinal(),
          produtos: produtosPayload,
          contatos: [Number(contatoId)],
        }),
      });

      setResultado(body.chamado);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const mostrarTimeline = !loading && !error && !resultado;
  const mostrarFooter = mostrarTimeline;
  const isLast = stepIndex === STEP_LABELS.length - 1;

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="topbar-title">Central de Soluções - Chamados</span>
      </header>

      {mostrarTimeline && (
        <>
          <div className="timeline">
            {STEP_LABELS.map((_, i) => (
              <div
                key={i}
                className={'timeline-step' + (i < stepIndex ? ' done' : i === stepIndex ? ' current' : '')}
              />
            ))}
          </div>
          <div className="timeline-label">
            Etapa {stepIndex + 1} de {STEP_LABELS.length} - {STEP_LABELS[stepIndex]}
          </div>
        </>
      )}

      <main className="content">
        {loading && (
          <div className="screen screen-center">
            <div className="spinner" />
            <p className="muted">Carregando seus dados...</p>
          </div>
        )}

        {!loading && error && (
          <div className="screen">
            <div className="result-icon">⚠️</div>
            <div className="alert alert-danger">{error}</div>
          </div>
        )}

        {!loading && !error && resultado && (
          <div className="screen">
            <div className="result-icon">✅</div>
            <div className="result-title">
              {jaConcluido ? 'Este atendimento já havia sido registrado' : 'Chamado aberto com sucesso!'}
            </div>
            <div className="result-number">{resultado.numero || `#${resultado.id}`}</div>
            <div className="card">
              <Row label="Assunto" value={resultado.assunto_descricao} />
              {resultado.motivo_descricao && <Row label="Motivo" value={resultado.motivo_descricao} />}
            </div>
            <p className="muted">Nossa equipe vai analisar e entrar em contato.</p>
            <p className="muted">Esta janela fecha sozinha em {fecharEmSegundos}s.</p>
          </div>
        )}

        {!loading && !error && !resultado && data && (
          <>
            {stepIndex === 0 && <PassoDados data={data} />}
            {stepIndex === 1 && (
              <PassoProdutos data={data} selected={selected} setSelected={setSelected} />
            )}
            {stepIndex === 2 && (
              <PassoDescricao
                descricaoExtra={descricaoExtra}
                setDescricaoExtra={setDescricaoExtra}
                preview={descricaoFinal()}
              />
            )}
            {stepIndex === 3 && (
              <PassoContato
                contatos={contatos}
                garantirContatosCarregados={garantirContatosCarregados}
                contatoSelecionado={contatoSelecionado}
                setContatoSelecionado={setContatoSelecionado}
                usandoNovoContato={usandoNovoContato}
                setUsandoNovoContato={setUsandoNovoContato}
                novoContato={novoContato}
                setNovoContato={setNovoContato}
              />
            )}
            {stepIndex === 4 && (
              <PassoRevisao
                data={data}
                produtosSelecionados={produtosSelecionados}
                contatos={contatos}
                contatoSelecionado={contatoSelecionado}
                usandoNovoContato={usandoNovoContato}
                novoContato={novoContato}
                submitError={submitError}
              />
            )}
          </>
        )}
      </main>

      {mostrarFooter && (
        <footer className="footer">
          {stepIndex > 0 && (
            <button type="button" className="btn btn-ghost" onClick={goBack}>Voltar</button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || !stepValido(stepIndex)}
            onClick={goNext}
          >
            {isLast ? (submitting ? 'Enviando...' : 'Enviar chamado') : 'Continuar'}
          </button>
        </footer>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="summary-row">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

function PassoDados({ data }) {
  return (
    <div className="screen">
      <div className="badge">{data.assunto.descricao}</div>
      <h1>{data.empresa}</h1>
      <p className="muted">Confira os dados do atendimento antes de continuar.</p>
      <div className="card">
        <Row label="Nota fiscal" value={data.numnota ? String(data.numnota) : '-'} />
        <Row label="Pedido" value={data.numped ? String(data.numped) : '-'} />
        <Row label="Data do pedido" value={data.data_pedido || '-'} />
        <Row label="Valor total" value={formatBRL(data.valor_total)} />
      </div>
    </div>
  );
}

const PRODUTOS_POR_PAGINA = 8;

function PassoProdutos({ data, selected, setSelected }) {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return data.produtos;
    return data.produtos.filter((p) => (
      String(p.codprod).includes(termo) || p.produto.toLowerCase().includes(termo)
    ));
  }, [data.produtos, busca]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PRODUTOS_POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const itensPagina = filtrados.slice(paginaAtual * PRODUTOS_POR_PAGINA, paginaAtual * PRODUTOS_POR_PAGINA + PRODUTOS_POR_PAGINA);
  const totalSelecionados = Object.values(selected).filter((s) => s.marcado).length;

  function handleBuscaChange(valor) {
    setBusca(valor);
    setPagina(0);
  }

  return (
    <div className="screen">
      <h1>Quais produtos vieram com preço errado?</h1>
      <p className="muted">Marque os itens divergentes e informe o preço correto de cada um.</p>

      <input
        type="text"
        placeholder="Buscar por código ou nome do produto"
        value={busca}
        onChange={(e) => handleBuscaChange(e.target.value)}
      />

      {totalSelecionados > 0 && (
        <p className="muted">{totalSelecionados} produto(s) selecionado(s) no total.</p>
      )}

      {itensPagina.length === 0 && (
        <p className="muted">Nenhum produto encontrado para "{busca}".</p>
      )}

      {itensPagina.map((p) => {
        const sel = selected[p.codprod] || { marcado: false, preco: '' };
        return (
          <div className="product-item" key={p.codprod}>
            <div className="product-head">
              <input
                type="checkbox"
                checked={sel.marcado}
                onChange={(e) => setSelected((prev) => ({
                  ...prev,
                  [p.codprod]: { ...prev[p.codprod], marcado: e.target.checked },
                }))}
              />
              <div>
                <div className="product-name">{p.produto}</div>
                <div className="product-meta">Cód. {p.codprod} · Qtd {p.qt} · Nota: {formatBRL(p.valor_nf_unit)} / un.</div>
              </div>
            </div>
            <div className={'product-price-input' + (sel.marcado ? ' visible' : '')}>
              <label>Preço correto (unitário):</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={sel.preco}
                onChange={(e) => setSelected((prev) => ({
                  ...prev,
                  [p.codprod]: { ...prev[p.codprod], preco: e.target.value },
                }))}
              />
            </div>
          </div>
        );
      })}

      {totalPaginas > 1 && (
        <div className="pagination">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={paginaAtual === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
          >
            Anterior
          </button>
          <span className="muted">Página {paginaAtual + 1} de {totalPaginas}</span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={paginaAtual >= totalPaginas - 1}
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}

function PassoDescricao({ descricaoExtra, setDescricaoExtra, preview }) {
  return (
    <div className="screen">
      <h1>Quer adicionar algum detalhe?</h1>
      <p className="muted">Isso é opcional - já vamos enviar um resumo com os produtos e preços que você informou.</p>
      <label className="field-label">Observações (opcional)</label>
      <textarea
        placeholder="Ex: o preço combinado com o vendedor era diferente do cobrado na nota..."
        value={descricaoExtra}
        onChange={(e) => setDescricaoExtra(e.target.value)}
      />
      <div className="card">
        <h2>Prévia do resumo enviado</h2>
        <p className="muted pre-line">{preview}</p>
      </div>
    </div>
  );
}

function PassoContato({
  contatos, garantirContatosCarregados, contatoSelecionado, setContatoSelecionado,
  usandoNovoContato, setUsandoNovoContato, novoContato, setNovoContato,
}) {
  const [emailBusca, setEmailBusca] = useState('');
  const [emailBuscado, setEmailBuscado] = useState(null);
  const [buscando, setBuscando] = useState(false);

  const resultados = useMemo(() => {
    if (emailBuscado === null) return [];
    return contatos.filter((c) => (c.email || '').trim().toLowerCase() === emailBuscado);
  }, [contatos, emailBuscado]);

  const semResultado = emailBuscado !== null && resultados.length === 0;

  async function handleBuscar() {
    const email = emailBusca.trim();
    if (!email || buscando) return;
    setBuscando(true);
    setUsandoNovoContato(false);
    try {
      const lista = await garantirContatosCarregados();
      const encontrados = lista.filter((c) => (c.email || '').trim().toLowerCase() === email.toLowerCase());
      setContatoSelecionado(encontrados.length === 1 ? encontrados[0].id : null);
      setEmailBuscado(email.toLowerCase());
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="screen">
      <h1>Quem devemos contatar?</h1>
      <p className="muted">Informe seu e-mail pra localizarmos seu cadastro.</p>

      <div className="search-row">
        <input
          type="email"
          placeholder="seuemail@empresa.com.br"
          value={emailBusca}
          onChange={(e) => setEmailBusca(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary btn-inline"
          disabled={buscando || !emailBusca.trim()}
          onClick={handleBuscar}
        >
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {resultados.length > 0 && (
        <>
          <p className="muted">
            {resultados.length > 1 ? 'Encontramos estes contatos com esse e-mail:' : 'Encontramos este contato:'}
          </p>
          {resultados.map((c) => (
            <label className="contact-option" key={c.id}>
              <input
                type="radio"
                name="contato"
                checked={!usandoNovoContato && contatoSelecionado === c.id}
                onChange={() => { setContatoSelecionado(c.id); setUsandoNovoContato(false); }}
              />
              <div>
                <div className="name">{c.nome_contato}</div>
                <div className="meta">{(c.celular || c.telefone || '')}{c.email ? ` · ${c.email}` : ''}</div>
              </div>
            </label>
          ))}
        </>
      )}

      {semResultado && !usandoNovoContato && (
        <div className="alert alert-danger">Não encontramos nenhum contato com esse e-mail.</div>
      )}

      {semResultado && !usandoNovoContato && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setUsandoNovoContato(true);
            setNovoContato((prev) => ({ ...prev, email: emailBusca.trim() }));
          }}
        >
          Cadastrar novo contato com esse e-mail
        </button>
      )}

      {usandoNovoContato && (
        <div className="card">
          <label className="field-label">Nome</label>
          <input
            type="text"
            placeholder="Nome completo"
            value={novoContato.nome_contato}
            onChange={(e) => setNovoContato((prev) => ({ ...prev, nome_contato: e.target.value }))}
          />
          <label className="field-label">Celular</label>
          <input
            type="tel"
            placeholder="(31) 98888-7777"
            value={novoContato.celular}
            onChange={(e) => setNovoContato((prev) => ({ ...prev, celular: e.target.value }))}
          />
          <label className="field-label">E-mail</label>
          <input
            type="email"
            placeholder="email@empresa.com.br"
            value={novoContato.email}
            onChange={(e) => setNovoContato((prev) => ({ ...prev, email: e.target.value }))}
          />
        </div>
      )}
    </div>
  );
}

function PassoRevisao({
  data, produtosSelecionados, contatos, contatoSelecionado, usandoNovoContato, novoContato, submitError,
}) {
  const contatoLabel = usandoNovoContato
    ? `${novoContato.nome_contato} (novo contato)`
    : (contatos.find((c) => c.id === contatoSelecionado)?.nome_contato || '-');

  return (
    <div className="screen">
      <h1>Revise antes de enviar</h1>
      <div className="card">
        <Row label="Empresa" value={data.empresa} />
        <Row label="Assunto" value={data.assunto.descricao} />
        <Row label="Contato" value={contatoLabel} />
      </div>
      <div className="card">
        {produtosSelecionados.map((item) => {
          const prod = data.produtos.find((p) => p.codprod === item.codprod);
          return <Row key={item.codprod} label={prod.produto} value={formatBRL(item.preco)} />;
        })}
      </div>
      {submitError && <div className="alert alert-danger">{submitError}</div>}
    </div>
  );
}
