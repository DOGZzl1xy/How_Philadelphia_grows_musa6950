// DeepSeek sometimes writes a tool call as text in its own markup (<｜｜DSML｜｜ invoke name="..."> ...). Split it off the
// answer and turn it into ordinary tool calls, so it is executed instead of shown to the reader.
export function splitMarkup(content: string): { text: string; calls: any[] } {
  if (!/DSML|<｜/.test(content)) return { text: content, calls: [] };
  const calls: any[] = [];
  const inv = /invoke name="([a-z_]+)">([\s\S]*?)<\/?[^>]*?invoke>/g;
  let m: RegExpExecArray | null;
  while ((m = inv.exec(content))) {
    const args: Record<string, unknown> = {};
    const par = /parameter name="([a-z_]+)"(?: string="(true|false)")?>([\s\S]*?)<\//g;
    let q: RegExpExecArray | null;
    while ((q = par.exec(m[2]))) {
      const raw = q[3].trim();
      try { args[q[1]] = q[2] === "false" ? JSON.parse(raw) : raw; } catch { args[q[1]] = raw; }
    }
    calls.push({ id: `dsml_${calls.length}`, type: "function", function: { name: m[1], arguments: JSON.stringify(args) } });
  }
  const text = content.replace(/<[^>\n]*DSML[^>\n]*>[^<\n]*(<\/[^>\n]*DSML[^>\n]*>)?/g, "").replace(/\n{3,}/g, "\n\n");
  return { text: /DSML|<｜/.test(text) ? "" : text, calls };
}
