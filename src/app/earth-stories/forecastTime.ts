import type { Attribute, NetCDFReader, Variable } from "netcdfjs";

type Grid = Pick<NetCDFReader, "variables" | "getDataVariable">;

export function forecastTime(grid: Grid, dimension: number | undefined) {
  const coordinate = (standard: string) => {
    const candidates = grid.variables.filter(
      (variable) =>
        (variable.attributes as Attribute[]).some(
          (a) => a.name === "standard_name" && a.value === standard,
        ) &&
        (variable.dimensions.length === 0 ||
          (variable.dimensions.length === 1 && variable.dimensions[0] === dimension)),
    );
    if (dimension === undefined || candidates.length !== 1)
      throw new Error("Missing or ambiguous forecast time coordinate");
    return candidates[0]!;
  };
  const timestamps = (variable: Variable) => {
    const units = (variable.attributes as Attribute[]).find((a) => a.name === "units")?.value;
    const match = typeof units === "string" && /^(seconds?|minutes?|hours?|days?) since (.+)$/i.exec(units);
    const origin = match ? Date.parse(match[2]!) : NaN;
    if (!match || !Number.isFinite(origin)) throw new Error("Invalid forecast time units");
    const step = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[1]![0]!.toLowerCase()]!;
    const values = grid.getDataVariable(variable).map((value) => origin + Number(value) * step);
    if (!values.length || !values.every(Number.isFinite)) throw new Error("Invalid forecast timestamps");
    return values;
  };
  // NCSS may rename axes between runs; each coordinate declares its own epoch and units.
  const times = timestamps(coordinate("time"));
  const reference = timestamps(coordinate("forecast_reference_time"));
  if (
    times.length < 2 ||
    times.some((at, i) => i > 0 && at <= times[i - 1]!) ||
    (reference.length !== 1 && reference.length !== times.length)
  )
    throw new Error("Incomplete forecast timestamps");
  return { times, runs: times.map((_, i) => (reference.length === 1 ? reference[0]! : reference[i]!)) };
}
