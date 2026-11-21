import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export interface Secao {
  titulo: string
  head: string[]
  body: (string | number)[][]
}

/** Gera um PDF com cabeçalho (título + grupo + período) e uma ou mais tabelas. */
export function exportarPDF(opts: {
  arquivo: string
  titulo: string
  grupo?: string
  periodo?: string
  secoes: Secao[]
}) {
  const doc = new jsPDF()
  const W = doc.internal.pageSize.getWidth()
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(20, 20, 20)
  doc.text(opts.titulo, W / 2, 16, { align: 'center' })
  let y = 22
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(70, 70, 70)
  if (opts.grupo) { doc.text(opts.grupo, W / 2, y, { align: 'center' }); y += 5 }
  if (opts.periodo) { doc.text(opts.periodo, W / 2, y, { align: 'center' }); y += 5 }
  doc.setFontSize(8); doc.setTextColor(120, 120, 120)
  doc.text('Gerado em ' + new Date().toLocaleString('pt-BR'), W / 2, y, { align: 'center' })
  y += 6

  opts.secoes.forEach((s) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 110, 50)
    doc.text(s.titulo, 14, y + 4)
    autoTable(doc, {
      startY: y + 7,
      head: [s.head],
      body: s.body.length ? s.body : [['—']],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 138, 60], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 245] },
      margin: { left: 14, right: 14 },
    })
    // @ts-expect-error lastAutoTable é adicionado pelo plugin
    y = doc.lastAutoTable.finalY + 10
  })
  doc.save(opts.arquivo + '.pdf')
}

/** Gera um .xlsx com uma aba por conjunto de linhas (array de objetos). */
export function exportarExcel(arquivo: string, abas: { nome: string; linhas: Record<string, unknown>[] }[]) {
  const wb = XLSX.utils.book_new()
  abas.forEach((a) => {
    const ws = XLSX.utils.json_to_sheet(a.linhas.length ? a.linhas : [{}])
    XLSX.utils.book_append_sheet(wb, ws, a.nome.slice(0, 31))
  })
  XLSX.writeFile(wb, arquivo + '.xlsx')
}
