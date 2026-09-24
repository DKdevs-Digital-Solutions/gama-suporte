'use client';

import { useEffect, useMemo, useState } from 'react';
import { getFluxo, rotuloEtapa } from '../../../lib/fluxosAssunto';

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

/** Número sem o 55 do Brasil, no formato que a API espera no celular do contato (DDD + número). */
function foneLocal(digitos) {
  const d = onlyDigits(digitos);
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d;
}

/** (31) 99999-9999 */
function formatarFone(digitos) {
  const d = foneLocal(digitos);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `+${onlyDigits(digitos)}`;
}

function paraNumero(valor) {
  return Number(String(valor).replace(',', '.'));
}

/** dd/mm/aaaa a partir de um input type=date (aaaa-mm-dd). */
function formatarData(iso) {
  if (!iso) return '';
  const partes = String(iso).split('-');
  if (partes.length !== 3) return String(iso);
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
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
  const [dataRecebimento, setDataRecebimento] = useState('');
  const [credito, setCredito] = useState({ nfOrigem: '', nfDevolucao: '', valor: '' });
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
  const [assuntoEscolhido, setAssuntoEscolhido] = useState(null);
  const [anexos, setAnexos] = useState([]);

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
          const produtos = (body.produtos || []).map((p) => ({
            ...p,
            codprod: Number(p.codprod),
            qt: Number(p.qt),
            valor_nf_unit: Number(p.valor_nf_unit),
            valor_nf_total: Number(p.valor_nf_total),
          }));
          setData({ ...body, produtos });
          const inicial = {};
          produtos.forEach((p) => {
            inicial[p.codprod] = { marcado: false, valor: '' };
          });
          setSelected(inicial);
        }
      } catch (err) {
        if (cancelado) return;
        // 404/410/422 trazem mensagem de negócio já pronta pro cliente (link expirado, nota que
        // não é do cliente, documento inválido); só falha de servidor/rede fica genérica.
        const mensagemDeNegocio = [404, 410, 422].includes(err.status) && err.message;
        setError(mensagemDeNegocio || 'Não foi possível carregar seus dados agora. Tente novamente em instantes.');
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

  // Link com grupo (ex: "devolucao") pergunta o subtipo aqui no checkout; sem grupo, o
  // assunto já vem fechado no token.
  const grupo = data?.grupo || null;
  const assuntoEfetivo = assuntoEscolhido || data?.assunto || null;
  const fluxo = useMemo(
    () => getFluxo(assuntoEfetivo?.id ?? grupo?.opcoes?.[0]?.id),
    [assuntoEfetivo, grupo],
  );
  const steps = useMemo(
    () => (grupo ? ['dados', 'assunto', ...fluxo.steps.slice(1)] : fluxo.steps),
    [grupo, fluxo],
  );
  const stepAtual = steps[stepIndex];

  // Trocar o assunto pode encurtar a lista de etapas (integral não tem produtos, por exemplo).
  useEffect(() => {
    setStepIndex((i) => Math.min(i, steps.length - 1));
  }, [steps]);
  const configProdutos = fluxo.produtos;
  const temEtapaProdutos = steps.some((s) => s === 'produtos_preco' || s === 'produtos_qt');
  // sem config própria: com produtos, o resumo deles já é o conteúdo do chamado (texto opcional);
  // sem produtos, o texto é o próprio conteúdo (obrigatório)
  const descricaoObrigatoria = fluxo.descricao?.obrigatoria ?? !temEtapaProdutos;

  const produtosSelecionados = useMemo(() => {
    return Object.keys(selected)
      .map((codprod) => ({ codprod: Number(codprod), ...selected[codprod] }))
      .filter((item) => item.marcado);
  }, [selected]);

  function stepValido(step) {
    if (step === 'assunto') return !!assuntoEscolhido;
    if (step === 'anexos') return true; // anexar é opcional, igual no fluxo da Blip
    if (step === 'produtos_preco' || step === 'produtos_qt') {
      if (produtosSelecionados.length === 0) return false;
      return produtosSelecionados.every((item) => {
        if (item.valor === '') return false;
        const v = paraNumero(item.valor);
        if (Number.isNaN(v) || v <= 0) return false;
        if (step === 'produtos_qt') {
          const prod = data.produtos.find((p) => p.codprod === item.codprod);
          // a API recusa quantidade de ocorrência maior que a da nota
          if (!Number.isInteger(v) || v > prod.qt) return false;
        }
        return true;
      });
    }
    if (step === 'data') return !!dataRecebimento;
    if (step === 'credito') {
      return onlyDigits(credito.nfOrigem).length > 0
        && onlyDigits(credito.nfDevolucao).length > 0
        && !Number.isNaN(paraNumero(credito.valor)) && credito.valor !== '';
    }
    if (step === 'descricao') return descricaoObrigatoria ? descricaoExtra.trim().length > 0 : true;
    if (step === 'contato') {
      if (usandoNovoContato) {
        return novoContato.nome_contato.trim().length > 0
          && onlyDigits(novoContato.celular).length >= 10
          && isValidEmail(novoContato.email);
      }
      return !!contatoSelecionado;
    }
    return true;
  }

  function descricaoFinal() {
    if (!data) return '';
    const doc = data.numnota || data.numped;
    const linhas = [];

    if (steps.includes('produtos_preco')) {
      linhas.push(`Cliente relata divergência de preço nos itens da nota ${doc}:`);
      produtosSelecionados.forEach((item) => {
        const prod = data.produtos.find((p) => p.codprod === item.codprod);
        linhas.push(`- ${prod.produto}: cobrado a ${formatBRL(prod.valor_nf_unit)}, preço correto informado ${formatBRL(paraNumero(item.valor))} (qtd ${prod.qt}).`);
      });
    } else if (steps.includes('produtos_qt')) {
      linhas.push(`${assuntoEfetivo.descricao} - itens informados pelo cliente na nota ${doc}:`);
      produtosSelecionados.forEach((item) => {
        const prod = data.produtos.find((p) => p.codprod === item.codprod);
        linhas.push(`- ${prod.produto}: ${paraNumero(item.valor)} de ${prod.qt} unidade(s) da nota.`);
      });
    } else if (fluxo.todosOsProdutos) {
      linhas.push(`${assuntoEfetivo.descricao} - todos os ${data.produtos.length} itens da nota ${doc}, nas quantidades faturadas.`);
    } else {
      linhas.push(`${assuntoEfetivo.descricao} - nota ${doc}.`);
      if (fluxo.aviso) linhas.push(fluxo.aviso);
    }

    if (steps.includes('data') && dataRecebimento) {
      linhas.push(`Data de recebimento da mercadoria: ${formatarData(dataRecebimento)}.`);
    }

    if (steps.includes('credito')) {
      linhas.push(`Nota fiscal de origem: ${credito.nfOrigem}.`);
      linhas.push(`Nota fiscal de devolução: ${credito.nfDevolucao}.`);
      linhas.push(`Valor do crédito consultado: ${formatBRL(paraNumero(credito.valor))}.`);
    }

    // a API não tem campo de telefone: o número de quem abriu pelo WhatsApp vai no texto
    if (data.whatsapp) {
      linhas.push(`Contato via WhatsApp: ${formatarFone(data.whatsapp)}.`);
    }

    let texto = linhas.join('\n');
    if (descricaoExtra.trim()) {
      const rotulo = fluxo.descricao?.rotuloNoChamado || 'Observações do cliente';
      texto += `\n\n${rotulo}: ${descricaoExtra.trim()}`;
    }
    return texto;
  }

  // Busca a lista de contatos do cliente uma única vez (cache em `contatos`); usada
  // pra localizar o contato pelo e-mail que a pessoa informar.
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
    if (stepIndex === steps.length - 1) return submit();
    if (!stepValido(stepAtual)) return;
    if (steps[stepIndex + 1] === 'contato') garantirContatosCarregados();
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

  function montarProdutos() {
    // devolução integral: a nota inteira, cada item na quantidade faturada
    if (fluxo.todosOsProdutos) {
      return data.produtos.map((prod) => ({
        codprod: prod.codprod,
        produto: prod.produto,
        qt: prod.qt,
        valor_nf_unit: prod.valor_nf_unit,
        quantidade_ocorrencia: prod.qt,
        valor_ocorrencia: prod.valor_nf_unit,
      }));
    }
    if (!temEtapaProdutos) return [];
    const modo = configProdutos.modo;
    return produtosSelecionados.map((item) => {
      const prod = data.produtos.find((p) => p.codprod === item.codprod);
      const informado = paraNumero(item.valor);
      return {
        codprod: prod.codprod,
        produto: prod.produto,
        qt: prod.qt,
        valor_nf_unit: prod.valor_nf_unit,
        quantidade_ocorrencia: modo === 'quantidade' ? informado : prod.qt,
        valor_ocorrencia: modo === 'preco' ? informado : prod.valor_nf_unit,
      };
    });
  }

  async function submit() {
    if (!stepValido('contato') || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const contatoId = await garantirContatoId();
      const body = await api(`/api/checkout/${token}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          descricao_chamado: descricaoFinal(),
          produtos: montarProdutos(),
          contatos: [Number(contatoId)],
          id_assunto: assuntoEfetivo ? assuntoEfetivo.id : undefined,
          anexos: anexos.length ? anexos.map((a) => a.url) : undefined,
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
  const isLast = stepIndex === steps.length - 1;

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="topbar-title">Central de Soluções - Chamados</span>
      </header>

      {mostrarTimeline && (
        <>
          <div className="timeline">
            {steps.map((_, i) => (
              <div
                key={i}
                className={'timeline-step' + (i < stepIndex ? ' done' : i === stepIndex ? ' current' : '')}
              />
            ))}
          </div>
          <div className="timeline-label">
            Etapa {stepIndex + 1} de {steps.length} - {rotuloEtapa(stepAtual)}
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
            {stepAtual === 'dados' && (
              <PassoDados
                data={data}
                etiqueta={assuntoEfetivo ? assuntoEfetivo.descricao : grupo?.label}
                aviso={grupo ? null : fluxo.aviso}
              />
            )}

            {stepAtual === 'assunto' && (
              <PassoAssunto
                grupo={grupo}
                escolhido={assuntoEscolhido}
                setEscolhido={setAssuntoEscolhido}
                aviso={fluxo.aviso}
              />
            )}

            {(stepAtual === 'produtos_preco' || stepAtual === 'produtos_qt') && (
              <PassoProdutos
                data={data}
                config={configProdutos}
                selected={selected}
                setSelected={setSelected}
              />
            )}

            {stepAtual === 'data' && (
              <PassoData valor={dataRecebimento} setValor={setDataRecebimento} />
            )}

            {stepAtual === 'credito' && (
              <PassoCredito credito={credito} setCredito={setCredito} />
            )}

            {stepAtual === 'anexos' && (
              <PassoAnexos token={token} anexos={anexos} setAnexos={setAnexos} />
            )}

            {stepAtual === 'descricao' && (
              <PassoDescricao
                descricaoExtra={descricaoExtra}
                setDescricaoExtra={setDescricaoExtra}
                obrigatoria={descricaoObrigatoria}
                config={fluxo.descricao}
                preview={descricaoFinal()}
              />
            )}

            {stepAtual === 'contato' && (
              <PassoContato
                contatos={contatos}
                garantirContatosCarregados={garantirContatosCarregados}
                contatoSelecionado={contatoSelecionado}
                setContatoSelecionado={setContatoSelecionado}
                usandoNovoContato={usandoNovoContato}
                setUsandoNovoContato={setUsandoNovoContato}
                novoContato={novoContato}
                setNovoContato={setNovoContato}
                whatsapp={data.whatsapp}
              />
            )}

            {stepAtual === 'revisao' && (
              <PassoRevisao
                data={data}
                assunto={assuntoEfetivo}
                todosOsProdutos={!!fluxo.todosOsProdutos}
                steps={steps}
                config={configProdutos}
                produtosSelecionados={produtosSelecionados}
                dataRecebimento={dataRecebimento}
                credito={credito}
                anexos={anexos}
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

      {mostrarTimeline && (
        <footer className="footer">
          {stepIndex > 0 && (
            <button type="button" className="btn btn-ghost" onClick={goBack}>Voltar</button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || !stepValido(stepAtual)}
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

function PassoDados({ data, etiqueta, aviso }) {
  return (
    <div className="screen">
      <div className="badge">{etiqueta}</div>
      <h1>{data.empresa}</h1>
      <p className="muted">Confira os dados do atendimento antes de continuar.</p>
      <div className="card">
        <Row label="Nota fiscal" value={data.numnota ? String(data.numnota) : '-'} />
        <Row label="Pedido" value={data.numped ? String(data.numped) : '-'} />
        <Row label="Data do pedido" value={data.data_pedido || '-'} />
        <Row label="Valor total" value={formatBRL(data.valor_total)} />
        {data.solicitacao_rca && <Row label="Solicitado pelo RCA" value={String(data.solicitacao_rca)} />}
        {data.whatsapp && <Row label="Seu WhatsApp" value={formatarFone(data.whatsapp)} />}
      </div>
      {aviso && <div className="alert alert-success">{aviso}</div>}
    </div>
  );
}

function PassoAssunto({ grupo, escolhido, setEscolhido, aviso }) {
  return (
    <div className="screen">
      <h1>{grupo.pergunta}</h1>
      <p className="muted">Escolha a opção que descreve o seu caso.</p>

      {grupo.opcoes.map((opcao) => (
        <label className="contact-option" key={opcao.id}>
          <input
            type="radio"
            name="assunto"
            checked={escolhido?.id === opcao.id}
            onChange={() => setEscolhido({ id: opcao.id, descricao: opcao.descricao })}
          />
          <div>
            <div className="name">{opcao.titulo}</div>
            {opcao.ajuda && <div className="meta">{opcao.ajuda}</div>}
          </div>
        </label>
      ))}

      {escolhido && aviso && <div className="alert alert-success">{aviso}</div>}
    </div>
  );
}

const PRODUTOS_POR_PAGINA = 8;

function PassoProdutos({ data, config, selected, setSelected }) {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);
  const ehQuantidade = config.modo === 'quantidade';

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
      <h1>{config.titulo}</h1>
      <p className="muted">{config.ajuda}</p>

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
        <p className="muted">Nenhum produto encontrado para &quot;{busca}&quot;.</p>
      )}

      {itensPagina.map((p) => {
        const sel = selected[p.codprod] || { marcado: false, valor: '' };
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
              <label>{config.rotuloCampo}</label>
              <input
                type="number"
                inputMode={ehQuantidade ? 'numeric' : 'decimal'}
                step={ehQuantidade ? '1' : '0.01'}
                min={ehQuantidade ? '1' : '0'}
                max={ehQuantidade ? String(p.qt) : undefined}
                placeholder={ehQuantidade ? '0' : '0,00'}
                value={sel.valor}
                onChange={(e) => setSelected((prev) => ({
                  ...prev,
                  [p.codprod]: { ...prev[p.codprod], valor: e.target.value },
                }))}
              />
            </div>
            {ehQuantidade && sel.marcado && sel.valor !== '' && paraNumero(sel.valor) > p.qt && (
              <div className="alert alert-danger">A nota tem só {p.qt} unidade(s) deste item.</div>
            )}
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

function PassoData({ valor, setValor }) {
  return (
    <div className="screen">
      <h1>Quando a mercadoria foi recebida?</h1>
      <p className="muted">Informe a data em que a entrega chegou.</p>
      <label className="field-label">Data de recebimento</label>
      <input type="date" value={valor} onChange={(e) => setValor(e.target.value)} />
    </div>
  );
}

const MAX_ANEXOS = 5; // limite da API

function PassoAnexos({ token, anexos, setAnexos }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);

  async function handleArquivos(event) {
    const arquivos = Array.from(event.target.files || []);
    event.target.value = ''; // permite reenviar o mesmo arquivo depois de remover
    if (arquivos.length === 0) return;

    setErro(null);
    setEnviando(true);
    try {
      for (const arquivo of arquivos) {
        if (anexos.length >= MAX_ANEXOS) {
          setErro(`Você pode enviar no máximo ${MAX_ANEXOS} arquivos.`);
          break;
        }
        const form = new FormData();
        form.append('arquivo', arquivo);
        const res = await fetch(`/api/checkout/${token}/anexos`, { method: 'POST', body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.success === false) {
          setErro(body.mensagem || 'Não foi possível enviar esse arquivo.');
          break;
        }
        // eslint-disable-next-line no-loop-func
        setAnexos((prev) => (prev.length >= MAX_ANEXOS ? prev : [...prev, { url: body.url, nome: body.nome }]));
      }
    } catch {
      setErro('Não foi possível enviar o arquivo agora.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="screen">
      <h1>Quer anexar fotos?</h1>
      <p className="muted">
        Envie fotos do produto ou da ocorrência para ajudar na análise. É opcional, e você pode
        mandar até {MAX_ANEXOS} arquivos (JPG, PNG ou PDF, até 10 MB cada).
      </p>

      <label className="btn btn-primary btn-arquivo">
        {enviando ? 'Enviando...' : 'Escolher arquivos'}
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          disabled={enviando || anexos.length >= MAX_ANEXOS}
          onChange={handleArquivos}
        />
      </label>

      {erro && <div className="alert alert-danger">{erro}</div>}

      {anexos.map((anexo, i) => (
        <div className="contact-option" key={anexo.url}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="name">{anexo.nome}</div>
            <div className="meta">Enviado</div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setAnexos((prev) => prev.filter((_, idx) => idx !== i))}
          >
            Remover
          </button>
        </div>
      ))}
    </div>
  );
}

function PassoCredito({ credito, setCredito }) {
  return (
    <div className="screen">
      <h1>Dados do crédito</h1>
      <p className="muted">Informe as notas envolvidas e o valor que deseja consultar.</p>
      <div className="card">
        <label className="field-label">Nota fiscal de origem</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Número da NF de origem"
          value={credito.nfOrigem}
          onChange={(e) => setCredito((prev) => ({ ...prev, nfOrigem: e.target.value }))}
        />
        <label className="field-label">Nota fiscal de devolução</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Número da NF de devolução"
          value={credito.nfDevolucao}
          onChange={(e) => setCredito((prev) => ({ ...prev, nfDevolucao: e.target.value }))}
        />
        <label className="field-label">Valor do crédito</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="0,00"
          value={credito.valor}
          onChange={(e) => setCredito((prev) => ({ ...prev, valor: e.target.value }))}
        />
      </div>
    </div>
  );
}

function PassoDescricao({ descricaoExtra, setDescricaoExtra, obrigatoria, config, preview }) {
  const titulo = config?.titulo || (obrigatoria ? 'Descreva o que aconteceu' : 'Quer adicionar algum detalhe?');
  const ajuda = config?.ajuda || (obrigatoria
    ? 'Conte o que houve para a nossa equipe entender o seu caso.'
    : 'Isso é opcional - já vamos enviar um resumo com os dados que você informou.');
  const rotulo = config?.rotulo || (obrigatoria ? 'Descrição' : 'Observações (opcional)');
  return (
    <div className="screen">
      <h1>{titulo}</h1>
      <p className="muted">{ajuda}</p>
      <label className="field-label">{rotulo}</label>
      <textarea
        placeholder="Descreva aqui o que aconteceu..."
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
  usandoNovoContato, setUsandoNovoContato, novoContato, setNovoContato, whatsapp,
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
            // o celular já vem do WhatsApp de quem está atendendo, dá pra editar se for outro
            setNovoContato((prev) => ({
              ...prev,
              email: emailBusca.trim(),
              celular: prev.celular || (whatsapp ? foneLocal(whatsapp) : ''),
            }));
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
  data, assunto, steps, config, produtosSelecionados, dataRecebimento, credito, anexos,
  contatos, contatoSelecionado, usandoNovoContato, novoContato, submitError, todosOsProdutos,
}) {
  const contatoLabel = usandoNovoContato
    ? `${novoContato.nome_contato} (novo contato)`
    : (contatos.find((c) => c.id === contatoSelecionado)?.nome_contato || '-');

  // na integral, itens marcados antes (se a pessoa passou pela parcial e voltou) não valem
  const temProdutos = !todosOsProdutos && produtosSelecionados.length > 0;
  const ehQuantidade = config && config.modo === 'quantidade';

  return (
    <div className="screen">
      <h1>Revise antes de enviar</h1>
      <div className="card">
        <Row label="Empresa" value={data.empresa} />
        <Row label="Assunto" value={assunto ? assunto.descricao : '-'} />
        <Row label="Contato" value={contatoLabel} />
        {steps.includes('data') && dataRecebimento && (
          <Row label="Recebido em" value={formatarData(dataRecebimento)} />
        )}
        {steps.includes('anexos') && (
          <Row label="Anexos" value={anexos.length ? `${anexos.length} arquivo(s)` : 'nenhum'} />
        )}
        {todosOsProdutos && (
          <Row label="Itens" value={`todos os ${data.produtos.length} da nota`} />
        )}
      </div>

      {steps.includes('credito') && (
        <div className="card">
          <Row label="NF de origem" value={credito.nfOrigem} />
          <Row label="NF de devolução" value={credito.nfDevolucao} />
          <Row label="Valor" value={formatBRL(paraNumero(credito.valor))} />
        </div>
      )}

      {temProdutos && (
        <div className="card">
          {produtosSelecionados.map((item) => {
            const prod = data.produtos.find((p) => p.codprod === item.codprod);
            const valor = ehQuantidade
              ? `${paraNumero(item.valor)} un.`
              : formatBRL(paraNumero(item.valor));
            return <Row key={item.codprod} label={prod.produto} value={valor} />;
          })}
        </div>
      )}

      {submitError && <div className="alert alert-danger">{submitError}</div>}
    </div>
  );
}
