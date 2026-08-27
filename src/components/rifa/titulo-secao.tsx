/** Cabeçalho padrão das seções da landing. */
export function TituloSecao({
  etiqueta,
  titulo,
  texto,
}: {
  etiqueta: string;
  titulo: string;
  texto?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-xs font-bold tracking-widest text-verde uppercase">
        {etiqueta}
      </span>
      <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">{titulo}</h2>
      {texto && <p className="mt-3 text-muted-foreground">{texto}</p>}
    </div>
  );
}
