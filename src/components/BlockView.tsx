import { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { formatMoney } from '../rules/budget';
import type { Block } from '../types';

/** 方案内容块渲染：所有模块共用同一套块类型，新增模块无需新增渲染分支 */
export default function BlockView({ block, onBudgetChange, onRowsChange, initiallyEditing = false, onTitleChange }: {
  block: Block;
  initiallyEditing?: boolean;
  onTitleChange?:(title:string)=>void;
  onBudgetChange?: (rowId: string, amount: number) => void;
  /** 传入后表格支持逐格编辑、删行与加行 */
  onRowsChange?: (rows: string[][]) => void;
}) {
  const [editing, setEditing] = useState(initiallyEditing);

  // 复用表格编辑器，让预设带入的流程、岗位和文字也支持增删改。
  if (onRowsChange && block.kind !== 'table') {
    const editable = block.kind === 'budget'
      ? { head: ['类别','科目','项目','金额','备注'], rows: block.rows.map(row=>[row.bucket,row.category,row.item,String(row.amount),row.note??'']) }
      : block.kind === 'timeline'
      ? { head: ['时间', '环节', '说明'], rows: block.entries.map((entry) => [entry.time, entry.title, entry.detail ?? '']) }
      : block.kind === 'staff'
      ? { head: ['岗位', '层级', '人数', '职责', '配置依据'], rows: block.rows.map((row) => [row.role, row.layer ?? '', String(row.count), row.duty, row.basis ?? '']) }
      : block.kind === 'kpis'
      ? { head: ['指标', '目标', '核算方式'], rows: block.rows.map((row) => [row.name, row.target, row.method]) }
      : block.kind === 'text'
      ? { head: ['内容'], rows: block.text.split('\n').map(line=>[line]) }
      : { head: ['内容'], rows: block.items.map((item) => [item]) };
    return <div className="block-group">
      <button type="button" className="text-button table-edit-toggle" onClick={() => setEditing(!editing)}>{editing ? '完成内容编辑' : '编辑内容'}</button>
      {editing
        ? <BlockView key="editor" initiallyEditing block={{ kind: 'table', title: 'title' in block ? block.title : undefined, ...editable }} onRowsChange={onRowsChange} onTitleChange={onTitleChange}/>
        : <BlockView key="preview" block={block}/>}
    </div>;
  }

  switch (block.kind) {
    case 'text':
      return <p className="block-text">{block.text}</p>;

    case 'bullets':
      return <div className="block-group">
        {block.title && <h5 className="block-title">{block.title}</h5>}
        <ul className="block-list">{block.items.map((item, index) => <li key={`${index}-${item.slice(0, 12)}`}>{item}</li>)}</ul>
      </div>;

    case 'checklist':
      return <div className="block-group">
        {block.title && <h5 className="block-title">{block.title}</h5>}
        <ul className="block-checklist">{block.items.map((item, index) => <li key={`${index}-${item.slice(0, 12)}`}><span className="tick"><Check size={12}/></span>{item}</li>)}</ul>
      </div>;

    case 'timeline':
      return <div className="block-group">
        {block.title && <h5 className="block-title">{block.title}</h5>}
        <ol className="block-timeline">{block.entries.map((entry) => <li key={`${entry.time}-${entry.title}`}>
          <span className="time">{entry.time}</span>
          <div><strong>{entry.title}</strong>{entry.detail && <p>{entry.detail}</p>}</div>
        </li>)}</ol>
      </div>;

    case 'budget':
      return <div className="block-group">
        {block.title && <h5 className="block-title">{block.title}</h5>}
        <div className="table-wrap"><table className="block-table budget-table">
          <thead><tr><th>类别</th><th>科目</th><th>项目</th><th className="num">金额</th><th className="num">占比</th></tr></thead>
          <tbody>{block.rows.map((row) => <tr key={row.id}>
            <td>{row.bucket}</td>
            <td>{row.category}</td>
            <td>{row.item}{row.note && <small className="cell-note">{row.note}</small>}</td>
            <td className="num">{onBudgetChange
              ? <input
                  className="budget-input"
                  type="number"
                  min={0}
                  step={10}
                  value={row.amount}
                  aria-label={`${row.category}金额`}
                  onChange={(event) => onBudgetChange(row.id, Number(event.target.value))}
                />
              : formatMoney(row.amount)}</td>
            <td className="num">{Math.round(row.share * 100)}%</td>
          </tr>)}</tbody>
          <tfoot><tr><td colSpan={3}>合计</td><td className="num">{formatMoney(block.total)}</td><td className="num">100%</td></tr></tfoot>
        </table></div>
        {block.note && <p className="block-note">{block.note}</p>}
      </div>;

    case 'kpis':
      return <div className="block-group">
        {block.title && <h5 className="block-title">{block.title}</h5>}
        <div className="table-wrap"><table className="block-table">
          <thead><tr><th>指标</th><th>目标</th><th>核算方式</th></tr></thead>
          <tbody>{block.rows.map((row) => <tr key={row.name}>
            <td>{row.name}</td><td>{row.target}</td><td className="muted-cell">{row.method}</td>
          </tr>)}</tbody>
        </table></div>
      </div>;

    case 'staff':
      return <div className="block-group">
        {block.title && <h5 className="block-title">{block.title}</h5>}
        <div className="table-wrap"><table className="block-table">
          <thead><tr><th>岗位</th><th>层级</th><th className="num">人数</th><th>职责</th><th>配置依据</th></tr></thead>
          <tbody>{block.rows.map((row) => <tr key={row.role}>
            <td>{row.role}</td>
            <td>{row.layer ?? '执行与保障'}</td>
            <td className="num">{row.count}</td>
            <td className="muted-cell">{row.duty}</td>
            <td className="muted-cell">{row.basis ?? '按规模配置'}</td>
          </tr>)}</tbody>
        </table></div>
      </div>;

    case 'table': {
      const editable = !!onRowsChange;
      const updateCell = (rowIndex: number, cellIndex: number, value: string) => {
        if (!onRowsChange) return;
        onRowsChange(block.rows.map((row, index) => index === rowIndex
          ? row.map((cell, position) => (position === cellIndex ? value : cell))
          : row));
      };
      const removeRow = (rowIndex: number) => {
        if (!onRowsChange) return;
        if(window.confirm('删除这一行内容？请确认此内容不再需要。'))onRowsChange(block.rows.filter((_, index) => index !== rowIndex));
      };
      const addRow = () => {
        if (!onRowsChange) return;
        const blank = block.head.map((_, index) => (index === 0 ? '新增条目' : ''));
        onRowsChange([...block.rows, blank]);
        setEditing(true);
      };

      return <div className="block-group">
        <div className="block-title-row">
          {block.title && (editing&&onTitleChange?<input className="module-title-input" aria-label="内容小标题" value={block.title} onChange={e=>onTitleChange(e.target.value)}/>:<h5 className="block-title">{block.title}</h5>)}
          {editable && <button type="button" className="table-edit-toggle" onClick={() => setEditing((value) => !value)}>
            {editing ? '完成编辑' : '编辑表格'}
          </button>}
        </div>
        <div className="table-wrap"><table className={`block-table ${editing ? 'editing' : ''}`}>
          <thead><tr>
            {block.head.map((cell) => <th key={cell}>{cell}</th>)}
            {editing && <th className="ops-col">操作</th>}
          </tr></thead>
          <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>
            {row.map((cell, cellIndex) => <td key={cellIndex} className={!editing && cellIndex === 0 ? 'strong-cell' : ''}>
              {editing
                ? <textarea
                    rows={2}
                    className="cell-input"
                    value={cell}
                    aria-label={`${block.head[cellIndex] ?? '单元格'} 第 ${rowIndex + 1} 行`}
                    onChange={(event) => updateCell(rowIndex, cellIndex, event.target.value)}
                  />
                : cell}
            </td>)}
            {editing && <td className="ops-col">
              <button type="button" className="row-delete" aria-label={`删除第 ${rowIndex + 1} 行`} onClick={() => removeRow(rowIndex)}>
                <Trash2 size={13}/>
              </button>
            </td>}
          </tr>)}</tbody>
        </table></div>
        {editing && <div className="table-edit-foot">
          <button type="button" className="table-add-row" onClick={addRow}><Plus size={13}/> 添加一行</button>
          <small>修改会立即保存到本机；打印与导出使用当前内容。</small>
        </div>}
      </div>;
    }
  }
}
