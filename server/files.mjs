import { existsSync } from 'node:fs';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, PageOrientation } from 'docx';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export function normalizeFile(input) {
  if (!input || typeof input !== 'object') throw new Error('文档格式无效');
  if (!['docx','xlsx','pdf'].includes(input.format)) throw new Error('不支持的导出格式');
  const text=String(input.text??'').slice(0,200000);
  const headers=Array.isArray(input.headers)?input.headers.slice(0,30).map(v=>String(v).slice(0,200)):[];
  const rows=Array.isArray(input.rows)?input.rows.slice(0,5000).map(row=>{
    if(!Array.isArray(row))throw new Error('表格行无效');return headers.map((_,i)=>String(row[i]??'').slice(0,2000));
  }):[];
  if(rows.length&&!headers.length)throw new Error('表格缺少列名');
  return {format:input.format,title:String(input.title??'活动资料').slice(0,100),activityTitle:String(input.activityTitle??'').slice(0,100),text,headers,rows};
}
export async function generateFile(input) {
  const data=normalizeFile(input);const {title,activityTitle,text,headers,rows,format}=data;
  if(format==='docx') {
    const paragraph=(value,bold=false)=>new Paragraph({spacing:{after:120},children:[new TextRun({text:value,font:'Microsoft YaHei',size:22,bold})]});
    const children=[paragraph(title,true),paragraph(activityTitle),...text.split('\n').map(line=>paragraph(line))];
    if(headers.length)children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[headers,...rows].map((row,i)=>new TableRow({tableHeader:i===0,cantSplit:true,children:row.map(cell=>new TableCell({width:{size:100/headers.length,type:WidthType.PERCENTAGE},children:[paragraph(cell,i===0)]}))}))}));
    const doc=new Document({sections:[{properties:{page:{size:{orientation:headers.length>6?PageOrientation.LANDSCAPE:PageOrientation.PORTRAIT},margin:{top:720,bottom:720,left:720,right:720}}},children}]});
    return {bytes:await Packer.toBuffer(doc),mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
  }
  if(format==='xlsx') {
    const book=new ExcelJS.Workbook();book.creator='活动实验室';const sheet=book.addWorksheet('活动资料',{views:[{state:'frozen',ySplit:headers.length?3:2}],pageSetup:{paperSize:9,orientation:headers.length>6?'landscape':'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0}});
    sheet.addRow([title]);sheet.addRow([activityTitle]);
    if(headers.length){sheet.addRow(headers);rows.forEach(row=>sheet.addRow(row));sheet.autoFilter={from:{row:3,column:1},to:{row:Math.max(3,rows.length+3),column:headers.length}};}
    else text.split('\n').forEach(line=>sheet.addRow([line]));
    sheet.columns.forEach((column,index)=>{column.width=headers.length?Math.min(45,Math.max(14,headers[index]?.length*2+4||20)):95;});
    sheet.eachRow((row,index)=>{row.eachCell(cell=>{cell.font={name:'Microsoft YaHei',size:11,bold:index===1||headers.length>0&&index===3,color:{argb:'FF203C2C'}};cell.alignment={vertical:'top',wrapText:true};if(index>=3&&headers.length)cell.border={top:{style:'thin',color:{argb:'FFD8E2D9'}},bottom:{style:'thin',color:{argb:'FFD8E2D9'}},left:{style:'thin',color:{argb:'FFD8E2D9'}},right:{style:'thin',color:{argb:'FFD8E2D9'}}};});});
    return {bytes:Buffer.from(await book.xlsx.writeBuffer()),mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
  }
  const candidates=[process.env.PDF_FONT_PATH,'C:/Windows/Fonts/simhei.ttf','/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'];
  const font=candidates.find(path=>path&&existsSync(path));if(!font)throw new Error('未找到中文 PDF 字体，请配置 PDF_FONT_PATH 指向支持中文的 TTF 字体');
  const doc=new PDFDocument({size:'A4',layout:headers.length>6?'landscape':'portrait',margin:36,bufferPages:true,info:{Title:title,Author:'活动实验室'}});
  const chunks=[];const completion=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  doc.font(font);const width=doc.page.width-72;const bottom=()=>doc.page.height-48;
  doc.fontSize(18).fillColor('#203c2c').text(title,{width});doc.moveDown(0.4);doc.fontSize(10).text(activityTitle,{width});doc.moveDown();
  if(text) {doc.fontSize(10).fillColor('#203c2c').text(text,{width,lineGap:4});doc.moveDown();}
  if(headers.length) {
    const col=width/headers.length;
    const paint=(row,header=false)=>{doc.fontSize(9);const height=Math.max(26,...row.map(cell=>doc.heightOfString(cell,{width:col-10})+12));
      if(height>doc.page.height-100)throw new Error('单行内容过长，请缩短后导出 PDF');
      if(doc.y+height>bottom()){doc.addPage();if(!header)paint(headers,true);}
      const y=doc.y;
      row.forEach((cell,index)=>{const x=36+index*col;doc.rect(x,y,col,height).fillAndStroke(header?'#e7f0e4':'#ffffff','#ccd8c9');doc.fillColor('#203c2c').text(cell,x+5,y+6,{width:col-10,height:height-8,lineBreak:true});});
      doc.x=36;doc.y=y+height;
    };
    paint(headers,true);rows.forEach(row=>paint(row));
  }
  doc.end();return {bytes:await completion,mime:'application/pdf'};
}
export async function importWorkbook(bytes) {
  const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);const sheet=book.worksheets[0];if(!sheet)throw new Error('Excel 没有工作表');if(sheet.rowCount>2001||sheet.columnCount>30)throw new Error('Excel 导入最多 2000 条记录、30 列');
  const rows=[];sheet.eachRow(row=>rows.push(Array.from({length:sheet.columnCount},(_,i)=>{const cell=row.getCell(i+1);if(cell.type===ExcelJS.ValueType.Formula)throw new Error('导入包含公式，请先转为值');return cell.value instanceof Date?cell.value.toISOString().slice(0,10):cell.text;})));return rows;
}
