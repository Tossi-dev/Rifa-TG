/* Validações dos dados do comprador. */

/**
 * Aceita SÓ texto de verdade.
 * Sem isto, `{"nome": {"a": 1}}` virava a string "[object Object]" e passava
 * na validação de nome; `["Fulano"]` idem.
 */
export function textoDoCorpo(valor: unknown, maximo = 120): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim().replace(/\s+/g, " ").slice(0, maximo);
  return limpo.length ? limpo : null;
}

/**
 * Aceita SÓ inteiro (número ou string de dígitos).
 * Sem isto, `[3]` era aceito e `2.7` cobrava 2 cotas sem avisar ninguém.
 */
export function inteiroDoCorpo(valor: unknown): number | null {
  if (typeof valor === "number") {
    return Number.isInteger(valor) ? valor : null;
  }
  if (typeof valor === "string" && /^\d+$/.test(valor.trim())) {
    return Number(valor.trim());
  }
  return null;
}

export function limparDigitos(v: string) {
  return (v || "").replace(/\D/g, "");
}

export function cpfValido(valor: string) {
  const cpf = limparDigitos(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 || resto === 11 ? 0 : resto;
  };

  return (
    digito(cpf.slice(0, 9), 10) === Number(cpf[9]) &&
    digito(cpf.slice(0, 10), 11) === Number(cpf[10])
  );
}

export function whatsappValido(valor: string) {
  const n = limparDigitos(valor);
  return n.length === 10 || n.length === 11;
}

export function nomeValido(valor: string) {
  const partes = (valor || "").trim().split(/\s+/).filter(Boolean);
  return partes.length >= 2 && partes.join("").length >= 5;
}

export function formatarCpf(valor: string) {
  const d = limparDigitos(valor).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function formatarTelefone(valor: string) {
  const d = limparDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d.replace(/^(\d{0,2})/, "($1");
  if (d.length <= 6) return d.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}
