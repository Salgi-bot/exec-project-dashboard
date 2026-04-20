import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'

// A4 portrait dimensions in mm
const A4_W_MM = 210
const A4_H_MM = 297
const MARGIN_MM = 10

function today(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

async function captureElement(el: HTMLElement): Promise<HTMLCanvasElement> {
  return await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    // html2canvas-pro handles oklch natively
  })
}

/**
 * Generate 2-page A4 PDF by capturing two page elements as images.
 * @param page1 - First page container (title + table 1)
 * @param page2 - Second page container (table 2), optional
 */
export async function generatePDF(
  page1: HTMLElement | null,
  page2: HTMLElement | null,
): Promise<void> {
  if (!page1) {
    console.error('[pdfExporter] page1 element is null')
    return
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const contentW = A4_W_MM - MARGIN_MM * 2
  const contentH = A4_H_MM - MARGIN_MM * 2

  // Page 1
  const canvas1 = await captureElement(page1)
  const img1 = canvas1.toDataURL('image/png')
  // Preserve aspect: fit inside content box
  const ratio1 = canvas1.width / canvas1.height
  let w1 = contentW
  let h1 = w1 / ratio1
  if (h1 > contentH) {
    h1 = contentH
    w1 = h1 * ratio1
  }
  const x1 = MARGIN_MM + (contentW - w1) / 2
  const y1 = MARGIN_MM
  pdf.addImage(img1, 'PNG', x1, y1, w1, h1, undefined, 'FAST')

  // Page 2 (if provided)
  if (page2) {
    pdf.addPage('a4', 'portrait')
    const canvas2 = await captureElement(page2)
    const img2 = canvas2.toDataURL('image/png')
    const ratio2 = canvas2.width / canvas2.height
    let w2 = contentW
    let h2 = w2 / ratio2
    if (h2 > contentH) {
      h2 = contentH
      w2 = h2 * ratio2
    }
    const x2 = MARGIN_MM + (contentW - w2) / 2
    const y2 = MARGIN_MM
    pdf.addImage(img2, 'PNG', x2, y2, w2, h2, undefined, 'FAST')
  }

  pdf.save(`임원회의_PROJECT진행일정표_${today()}.pdf`)
}
