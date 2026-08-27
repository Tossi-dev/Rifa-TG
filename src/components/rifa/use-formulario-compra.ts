"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { cpfValido, limparDigitos, nomeValido, whatsappValido } from "@/lib/validacao";
import type { DadosComprador, ErrosComprador } from "./campos-comprador";

/**
 * Estado e envio do formulário de compra.
 * Fica separado da tela para o componente cuidar só do visual.
 * (o prefixo "use" e exigencia do React para hooks)
 */
export function useFormularioCompra() {
  const router = useRouter();
  const [cotas, setCotas] = useState<number>(10);
  const [dados, setDados] = useState<DadosComprador>({
    nome: "",
    whatsapp: "",
    cpf: "",
  });
  /* Código de quem indicou. Fica no formulário e não no componente do campo
     porque é o formulário que envia — e assim a marca do link pessoal
     sobrevive mesmo se o campo não chegar a ser renderizado. */
  const [vendedor, setVendedor] = useState<string>("");
  const [erros, setErros] = useState<ErrosComprador>({});
  const [falha, setFalha] = useState<string>("");
  const [enviando, setEnviando] = useState<boolean>(false);

  const mudarCampo = (campo: keyof DadosComprador, valor: string): void =>
    setDados((atual) => ({ ...atual, [campo]: valor }));

  /* Mesmas regras da API, só que aqui para dar retorno imediato ao comprador. */
  function validar(): boolean {
    const novos: ErrosComprador = {};
    if (!nomeValido(dados.nome)) novos.nome = "Digite seu nome e sobrenome.";
    if (!whatsappValido(dados.whatsapp))
      novos.whatsapp = "Digite o WhatsApp com DDD.";
    if (!cpfValido(dados.cpf)) novos.cpf = "Confira o CPF digitado.";
    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  async function enviar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setFalha("");
    if (!validar()) return;

    setEnviando(true);
    try {
      const resposta = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: dados.nome,
          whatsapp: limparDigitos(dados.whatsapp),
          cpf: limparDigitos(dados.cpf),
          cotas,
          vendedor: vendedor || undefined,
        }),
      });
      const corpo = (await resposta.json()) as { id?: string; erro?: string };
      if (!resposta.ok) {
        setFalha(corpo.erro ?? "Não foi possível concluir. Tente novamente.");
        setEnviando(false);
        return;
      }
      // Deu certo: segue para a tela do Pix (os números saem na confirmação).
      router.push(`/pagamento/${corpo.id}`);
    } catch {
      setFalha("Falha de conexão. Confira sua internet e tente de novo.");
      setEnviando(false);
    }
  }

  return {
    cotas,
    setCotas,
    vendedor,
    setVendedor,
    dados,
    erros,
    falha,
    enviando,
    mudarCampo,
    enviar,
  };
}
