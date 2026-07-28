import { useCallback, useEffect, useState } from "react";
import type { AdminOrderSummary, AdminSkuOperationsRow, WorkerCertification } from "@xlb/types";
import { ApiErrorPanel, Button, Card, ConfirmButton, EmptyState, ScopeBadge, StatusTag, Table } from "@xlb/ui";
import { adminOpsApi as api, adminVisibleError } from "../adminAuth";
import { adminDemoCityLabel, IS_ADMIN_INVESTOR_DEMO } from "../investorDemo";

type PlatformOperationsAccess = {
  orders: boolean;
  catalog: boolean;
  catalogManage: boolean;
  certification: boolean;
  certificationDecide: boolean;
};

export function PlatformOperationsPage({
  initialCityCode,
  access = {
    orders: true,
    catalog: true,
    catalogManage: true,
    certification: true,
    certificationDecide: true,
  },
}: {
  initialCityCode?: string;
  access?: PlatformOperationsAccess;
}) {
  const [orders,setOrders]=useState<AdminOrderSummary[]>([]);
  const [skus,setSkus]=useState<AdminSkuOperationsRow[]>([]);
  const [certifications,setCertifications]=useState<WorkerCertification[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const cityCode=initialCityCode||"hangzhou";

  const load=useCallback(async()=>{
    setBusy("load");setError(null);
    try {
      const [orderResult, skuResult, certResult] = await Promise.all([
        access.orders ? api.listOperationsOrders() : Promise.resolve(null),
        access.catalog ? api.listOperationsSkus() : Promise.resolve(null),
        access.certification ? api.listWorkerCertifications() : Promise.resolve(null),
      ]);
      setOrders(orderResult?.orders ?? []);
      setSkus(skuResult?.skus ?? []);
      setCertifications(certResult?.certifications ?? []);
    }
    catch(caught){setError(adminVisibleError(caught,"订单列表暂时无法加载，请稍后重试。"));}
    finally{setBusy(null);}
  },[access.catalog, access.certification, access.orders]);
  useEffect(()=>{void load();},[load]);

  async function act(key:string,action:()=>Promise<unknown>){setBusy(key);setError(null);try{await action();await load();}catch(caught){setError(adminVisibleError(caught,"操作未完成，请刷新后重试。"));}finally{setBusy(null);}}

  return <div style={{display:"grid",gap:16}}>
    <Card title="订单与师傅" actions={<><ScopeBadge scope={`城市：${adminDemoCityLabel(cityCode)}`}/><StatusTag tone="success">演示权限已收敛</StatusTag></>}>
      <Button onClick={()=>void load()} disabled={busy!==null}>刷新列表</Button>
    </Card>
    {error&&<ApiErrorPanel title="订单列表加载失败" detail={error} action={<Button onClick={()=>void load()}>重新加载</Button>}/>}
    {access.orders && <Card title="城市订单" actions={<StatusTag tone="primary">{orders.length} 条</StatusTag>}>
      {orders.length===0?<EmptyState title="当前城市暂无订单" description="客户完成下单后，订单会显示在这里。"/>:<Table rows={orders} getRowKey={row=>row.orderId} columns={[
        {key:"order",title:"订单编号",render:row=>row.orderId},{key:"customer",title:"客户",render:row=>IS_ADMIN_INVESTOR_DEMO?"演示客户":row.customerId},
        {key:"sku",title:"服务项目",render:row=><div><strong>{row.skuName}</strong>{!IS_ADMIN_INVESTOR_DEMO&&<><br/><small>{row.skuId}</small></>}</div>},
        {key:"status",title:"状态",render:row=><StatusTag tone={row.status==="cancelled"?"danger":row.status==="service_completed"?"success":"warning"}>{row.status==="cancelled"?"已取消":row.status==="service_completed"?"服务已完成":"处理中"}</StatusTag>},
        {key:"amount",title:"金额",render:row=>`¥ ${row.totalAmount.toFixed(2)}`},
        {key:"trace",title:"查看",render:row=><Button onClick={()=>{window.location.hash=`#/order-trace?cityCode=${encodeURIComponent(cityCode)}&orderId=${encodeURIComponent(row.orderId)}`;}}>查看全链路</Button>},
      ]}/>}
    </Card>}
    {access.catalog && <Card title="SKU Availability" actions={<><StatusTag tone="primary">{skus.length}</StatusTag>{access.catalogManage && <StatusTag tone="warning">canonical catalog write</StatusTag>}</>}>
      {skus.length===0?<EmptyState title="No city SKU"/>:<Table rows={skus} getRowKey={row=>row.skuId} columns={[
        {key:"category",title:"Category",render:row=>row.categoryName},{key:"sku",title:"SKU",render:row=><div><strong>{row.skuName}</strong><br/><small>{row.skuId}</small></div>},
        {key:"price",title:"Price",render:row=>row.basePrice===null?"-":`CNY ${row.basePrice.toFixed(2)} / ${row.unit}`},
        {key:"standard",title:"Standard",render:row=>`${row.warrantyDays??0}d warranty · ${row.supportsEnterprise?"B+C":"C"}`},
        {key:"status",title:"Status",render:row=><StatusTag tone={row.isEnabled?"success":"muted"}>{row.isEnabled?"enabled":"disabled"}</StatusTag>},
        ...(access.catalogManage ? [{key:"control",title:"Control",render:(row: AdminSkuOperationsRow)=><ConfirmButton disabled={busy!==null} onConfirm={()=>void act(`sku:${row.skuId}`,()=>api.setOperationsSkuEnabled(row.skuId,!row.isEnabled))}>{row.isEnabled?"Disable":"Enable"}</ConfirmButton>}] : []),
      ]}/>}
    </Card>}
    {access.certification && <Card title="Worker Certification Review" actions={<StatusTag tone="primary">{certifications.length}</StatusTag>}>
      {certifications.length===0?<EmptyState title="No certification application"/>:<Table rows={certifications} getRowKey={row=>row.certificationId} columns={[
        {key:"worker",title:"Worker",render:row=>row.workerId},{key:"cert",title:"Certification",render:row=><div><strong>{row.certName}</strong><br/><small>{row.certType}</small></div>},
        {key:"status",title:"Status",render:row=><StatusTag tone={row.status==="approved"?"success":row.status==="rejected"?"danger":"warning"}>{row.status}</StatusTag>},
        ...(access.certificationDecide ? [{key:"review",title:"Review",render:(row: WorkerCertification)=><div style={{display:"flex",gap:8}}><ConfirmButton disabled={busy!==null||row.status!=="pending"} onConfirm={()=>void act(`approve:${row.certificationId}`,()=>api.approveWorkerCertification(row.certificationId))}>Approve</ConfirmButton><ConfirmButton disabled={busy!==null||row.status!=="pending"} onConfirm={()=>void act(`reject:${row.certificationId}`,()=>api.rejectWorkerCertification(row.certificationId,"Requirements not met"))}>Reject</ConfirmButton></div>}] : []),
      ]}/>}
    </Card>}
  </div>;
}
