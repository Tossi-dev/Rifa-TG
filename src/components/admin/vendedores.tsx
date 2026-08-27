"use client";

/* =========================================================================
 *  Vendedores.
 *
 *  Cadastro, link pessoal e ranking numa seção só. O ranking NÃO é um
 *  contador guardado no banco: é a soma dos pedidos pagos, feita no servidor
 *  a cada carregamento. Comissão calculada por contador incremental derrapa
 *  no primeiro estorno, e ninguém percebe até alguém reclamar.
 * ========================================================================= */

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Link2,
  ListPlus,
  MessageCircle,
  Plus,
  UserPlus,
  UserX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RIFA, brl } from "@/lib/config";
import type { LinhaVendedor } from "@/lib/vendedores";
import { linkDoPlacar, linkWhatsApp, mensagemParaVendedor } from "@/lib/vendedores";
import { GraficoHorizontal, Moldura } from "./graficos";

interface Cadastro {
  codigo: string;
  nome: string;
  ativo: boolean;
}

export function SecaoVendedores({
  token,
  ranking,
  direta,
  simulando,
  aoMudarCadastro,
}: {
  token: string;
  ranking: LinhaVendedor[];
  direta: { pedidos: number; cotas: number; valor: number };
  simulando: boolean;
  aoMudarCadastro: () => void;
}) {
  const [cadastro, setCadastro] = useState<Cadastro[]>([]);
  const [nome, setNome] = useState<string>("");
  const [lote, setLote] = useState<string>("");
  const [emLote, setEmLote] = useState<boolean>(false);
  const [aviso, setAviso] = useState<string>("");
  const [salvando, setSalvando] = useState<boolean>(false);
  const [erro, setErro] = useState<string>("");
  const [copiado, setCopiado] = useState<string>("");

  const carregar = useCallback(async (): Promise<void> => {
    try {
      const resposta = await fetch("/api/admin/vendedores", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!resposta.ok) return;
      const corpo = (await resposta.json()) as { vendedores: Cadastro[] };
      setCadastro(corpo.vendedores);
    } catch {
      // Silêncio: a seção some, o resto do painel continua funcionando.
    }
  }, [token]);

  useEffect(() => {
    /* Buscar o cadastro no servidor é o caso de uso do efeito: o `setState`
       acontece dentro da promessa, depois da pintura, e não em cascata no
       corpo do efeito. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  async function cadastrar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const texto = emLote ? lote : nome;
    if (!texto.trim()) return;

    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const resposta = await fetch("/api/admin/vendedores", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emLote ? { lista: texto } : { nome: texto.trim() }),
      });
      const corpo = (await resposta.json()) as {
        erro?: string;
        vendedores?: Cadastro[];
        recusados?: string[];
      };
      if (!resposta.ok) {
        setErro(corpo.erro ?? "Não foi possível cadastrar.");
        return;
      }

      const quantos = corpo.vendedores?.length ?? 1;
      /* Diz quantos entraram DE VERDADE, não quantas linhas foram coladas: a
         limpeza descarta repetido e linha vazia, e quem colou precisa saber
         disso na hora, não descobrir contando a lista depois. */
      setAviso(
        quantos === 1
          ? "1 vendedor cadastrado."
          : `${quantos} vendedores cadastrados.` +
              (corpo.recusados?.length
                ? ` ${corpo.recusados.length} linha(s) sem letra suficiente foram ignoradas.`
                : "")
      );
      setNome("");
      setLote("");
      await carregar();
      aoMudarCadastro();
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(codigo: string, ativo: boolean) {
    try {
      await fetch("/api/admin/vendedores", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ codigo, ativo }),
      });
      await carregar();
      aoMudarCadastro();
    } catch {
      setErro("Falha de conexão.");
    }
  }

  async function copiar(codigo: string) {
    const link = `${window.location.origin}/v/${codigo}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(codigo);
      window.setTimeout(() => setCopiado(""), 2000);
    } catch {
      setErro(`Copie à mão: ${link}`);
    }
  }

  /**
   * Abre o WhatsApp com a mensagem pronta para o vendedor.
   *
   * O que vai na mensagem é o link do PLACAR, não o de venda: é o único que
   * não precisa ser reenviado nunca, porque o link de venda mora dentro dele.
   */
  function mandarNoWhatsApp(v: Cadastro) {
    const texto = mensagemParaVendedor(
      v.nome,
      linkDoPlacar(window.location.origin, v.codigo),
      RIFA.titulo
    );
    window.open(linkWhatsApp(texto), "_blank", "noopener,noreferrer");
  }

  const comVenda = ranking.filter((v) => v.cotas > 0);
  const totalVendedores = ranking.reduce((s, v) => s + v.cotas, 0);

  return (
    <div className="space-y-4">
      <Moldura
        titulo="Quem mais vendeu"
        descricao="Cotas confirmadas por vendedor — só entra pagamento aprovado"
        vazio={
          comVenda.length
            ? undefined
            : "Nenhuma venda com vendedor marcado ainda. Assim que alguém comprar por um link pessoal, o ranking aparece aqui."
        }
      >
        {(w) => (
          <GraficoHorizontal
            largura={w}
            itens={comVenda.slice(0, 10).map((v) => ({
              rotulo: v.nome,
              valor: v.cotas,
              detalhe: brl(v.valor),
            }))}
          />
        )}
      </Moldura>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-extrabold">
                <UserPlus className="size-5" /> Vendedores
              </h2>
              <p className="text-sm text-muted-foreground">
                Cada um tem um link próprio. Quem comprar por ele entra na conta
                dessa pessoa automaticamente.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground tabular-nums">
                {totalVendedores.toLocaleString("pt-BR")}
              </strong>{" "}
              cotas por vendedor ·{" "}
              <strong className="text-foreground tabular-nums">
                {direta.cotas.toLocaleString("pt-BR")}
              </strong>{" "}
              venda direta
            </p>
          </div>

          {simulando && (
            <p className="rounded-lg border-2 border-dashed border-estado-atencao bg-secondary px-4 py-2 text-sm">
              O ranking acima é da simulação. O cadastro abaixo é real — o que
              você criar ou desligar aqui vale de verdade.
            </p>
          )}

          <form className="space-y-2" onSubmit={(e) => void cadastrar(e)}>
            {emLote ? (
              <>
                <textarea
                  value={lote}
                  onChange={(e) => setLote(e.target.value)}
                  rows={8}
                  aria-label="Lista de nomes, um por linha"
                  placeholder={"Cole a lista aqui, um nome por linha:\n\nJoão Vitor Silva\nAna Paula Ribeiro\nMarcos Dias"}
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                <p className="text-xs text-muted-foreground">
                  Pode colar direto da planilha ou da chamada. Numeração
                  (&quot;1.&quot;), traço e linha em branco são limpos sozinhos,
                  e nome repetido entra uma vez só.
                </p>
              </>
            ) : (
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do vendedor"
                aria-label="Nome do vendedor"
              />
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={salvando}>
                <Plus />{" "}
                {salvando
                  ? "Cadastrando..."
                  : emLote
                    ? "Cadastrar a lista"
                    : "Cadastrar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEmLote(!emLote);
                  setErro("");
                  setAviso("");
                }}
              >
                <ListPlus /> {emLote ? "Cadastrar um só" : "Colar uma lista"}
              </Button>
            </div>
          </form>

          {erro && <p className="text-sm text-destructive">{erro}</p>}
          {aviso && (
            <p className="text-sm font-medium text-estado-bom-texto">{aviso}</p>
          )}

          {cadastro.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum vendedor cadastrado. Cadastre o primeiro acima e mande o
              link para ele.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {cadastro.map((v) => {
                const linha = ranking.find((r) => r.codigo === v.codigo);
                return (
                  <li
                    key={v.codigo}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm"
                  >
                    <span
                      className={`min-w-[140px] flex-1 font-semibold ${
                        v.ativo ? "" : "text-muted-foreground line-through"
                      }`}
                    >
                      {v.nome}
                    </span>

                    <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                      <Link2 className="size-3.5 shrink-0" aria-hidden />
                      /v/{v.codigo}
                    </span>

                    <span className="tabular-nums">
                      {(linha?.cotas ?? 0).toLocaleString("pt-BR")} cotas
                    </span>
                    <span className="w-24 text-right tabular-nums text-muted-foreground">
                      {brl(linha?.valor ?? 0)}
                    </span>

                    <Button
                      size="sm"
                      onClick={() => mandarNoWhatsApp(v)}
                      title="Abre o WhatsApp com a mensagem pronta e o link do painel dele. Você só escolhe o contato."
                    >
                      <MessageCircle /> Mandar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void copiar(v.codigo)}
                    >
                      {copiado === v.codigo ? <Check /> : <Copy />}
                      {copiado === v.codigo ? "Copiado" : "Copiar link"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void alternar(v.codigo, !v.ativo)}
                      title={
                        v.ativo
                          ? "Some da lista do checkout e o link para de marcar. As vendas já feitas continuam contando."
                          : "Volta para a lista do checkout."
                      }
                    >
                      <UserX /> {v.ativo ? "Desligar" : "Religar"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Mandar</strong> abre o WhatsApp
            com a mensagem pronta e o link do painel pessoal — é o único link
            que a pessoa precisa guardar, porque o link de venda dela fica
            dentro. <strong className="text-foreground">Desligar</strong> não
            apaga: as vendas já feitas continuam no ranking e no CSV.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
