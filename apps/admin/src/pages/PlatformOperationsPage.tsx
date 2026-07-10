import { useCallback, useEffect, useState } from "react";
import type { AdminOrderSummary, AdminSkuOperationsRow, WorkerCertification } from "@xlb/types";
import { ApiErrorPanel, Button, Card, EmptyState, ScopeBadge, StatusTag, Table } from "@xlb/ui";
import { adminOpsApi as api } from "../adminAuth";

export function PlatformOperationsPage({ initialCityCode }: { initialCityCode?: string }) {
  const [orders,setOrders]=useState<AdminOrderSummary[]>([]);
  const [skus,setSkus]=useState<AdminSkuOperationsRow[]>([]);
  const [certifications,setCertifications]=useState<WorkerCertification[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const cityCode=initialCityCode||"hangzhou";

  const load=useCallback(async()=>{
    setBusy("load");setError(null);
    try{const [orderResult,skuResult,certResult]=await Promise.all([api.listOperationsOrders(),api.listOperationsSkus(),api.listWorkerCertifications()]);setOrders(orderResult.orders);setSkus(skuResult.skus);setCertifications(certResult.certifications);}
    catch(caught){setError(caught instanceof Error?caught.message:"Unable to load platform operations");}
    finally{setBusy(null);}
  },[]);
  useEffect(()=>{void load();},[load]);

  async function act(key:string,action:()=>Promise<unknown>){setBusy(key);setError(null);try{await action();await load();}catch(caught){setError(caught instanceof Error?caught.message:"Operation failed");}finally{setBusy(null);}}

  return <div style={{display:"grid",gap:16}}>
    <Card title="Platform Operations" actions={<><ScopeBadge scope={`city: ${cityCode}`}/><StatusTag tone="success">admin-only API</StatusTag></>}>
      <Button onClick={()=>void load()} disabled={busy!==null}>Refresh all</Button>
    </Card>
    {error&&<ApiErrorPanel title="Platform operation failed" detail={error}/>}
    <Card title="Order Pool" actions={<StatusTag tone="primary">{orders.length}</StatusTag>}>
      {orders.length===0?<EmptyState title="No city orders"/>:<Table rows={orders} getRowKey={row=>row.orderId} columns={[
        {key:"order",title:"Order",render:row=>row.orderId},{key:"customer",title:"Customer",render:row=>row.customerId},
        {key:"sku",title:"SKU",render:row=><div><strong>{row.skuName}</strong><br/><small>{row.skuId}</small></div>},
        {key:"status",title:"Status",render:row=><StatusTag tone={row.status==="cancelled"?"danger":row.status==="service_completed"?"success":"warning"}>{row.status}</StatusTag>},
        {key:"amount",title:"Amount",render:row=>`CNY ${row.totalAmount.toFixed(2)}`},
        {key:"trace",title:"Trace",render:row=><Button onClick={()=>{window.location.hash=`#/order-trace?cityCode=${encodeURIComponent(cityCode)}&orderId=${encodeURIComponent(row.orderId)}`;}}>Open trace</Button>},
      ]}/>}
    </Card>
    <Card title="SKU Availability" actions={<><StatusTag tone="primary">{skus.length}</StatusTag><StatusTag tone="warning">canonical catalog write</StatusTag></>}>
      {skus.length===0?<EmptyState title="No city SKU"/>:<Table rows={skus} getRowKey={row=>row.skuId} columns={[
        {key:"category",title:"Category",render:row=>row.categoryName},{key:"sku",title:"SKU",render:row=><div><strong>{row.skuName}</strong><br/><small>{row.skuId}</small></div>},
        {key:"price",title:"Price",render:row=>row.basePrice===null?"-":`CNY ${row.basePrice.toFixed(2)} / ${row.unit}`},
        {key:"standard",title:"Standard",render:row=>`${row.warrantyDays??0}d warranty · ${row.supportsEnterprise?"B+C":"C"}`},
        {key:"status",title:"Status",render:row=><StatusTag tone={row.isEnabled?"success":"muted"}>{row.isEnabled?"enabled":"disabled"}</StatusTag>},
        {key:"control",title:"Control",render:row=><Button disabled={busy!==null} onClick={()=>void act(`sku:${row.skuId}`,()=>api.setOperationsSkuEnabled(row.skuId,!row.isEnabled))}>{row.isEnabled?"Disable":"Enable"}</Button>},
      ]}/>}
    </Card>
    <Card title="Worker Certification Review" actions={<StatusTag tone="primary">{certifications.length}</StatusTag>}>
      {certifications.length===0?<EmptyState title="No certification application"/>:<Table rows={certifications} getRowKey={row=>row.certificationId} columns={[
        {key:"worker",title:"Worker",render:row=>row.workerId},{key:"cert",title:"Certification",render:row=><div><strong>{row.certName}</strong><br/><small>{row.certType}</small></div>},
        {key:"status",title:"Status",render:row=><StatusTag tone={row.status==="approved"?"success":row.status==="rejected"?"danger":"warning"}>{row.status}</StatusTag>},
        {key:"review",title:"Review",render:row=><div style={{display:"flex",gap:8}}><Button disabled={busy!==null||row.status!=="pending"} onClick={()=>void act(`approve:${row.certificationId}`,()=>api.approveWorkerCertification(row.certificationId))}>Approve</Button><Button disabled={busy!==null||row.status!=="pending"} onClick={()=>void act(`reject:${row.certificationId}`,()=>api.rejectWorkerCertification(row.certificationId,"Requirements not met"))}>Reject</Button></div>},
      ]}/>}
    </Card>
  </div>;
}
