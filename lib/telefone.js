// Telefones brasileiros chegam em formatos diferentes: o cadastro do Gsync guarda "+5528999067407",
// o WhatsApp manda "5531999998888" e, para alguns números, sem o 9 do celular ("553199998888").
// Tudo é comparado e gravado como DDD + número, com o 9 nos celulares (o formato que a API pede).
export function telefoneBR(valor) {
  let d = String(valor || '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  // celular antigo sem o 9: o número depois do DDD começa com 6-9
  if (d.length === 10 && /[6-9]/.test(d[2])) d = `${d.slice(0, 2)}9${d.slice(2)}`;
  return d;
}

/** (31) 99999-8888 */
export function formatarTelefone(valor) {
  const d = telefoneBR(valor);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(valor || '');
}
