import { useCallback, useEffect, useState } from "react";
import type {
  AftersaleComplaintDetailResponse,
  AftersaleComplaintResponse,
  OrderReverseResponse,
} from "@xlb/api-client";
import {
  ApiErrorPanel,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  ScopeBadge,
  StatusTag,
  Table,
} from "@xlb/ui";
import { adminOpsApi as api } from "../adminAuth";

export function AftersaleOpsPage({ initialCityCode }: { initialCityCode?: string }) {
  const [cityCode,setCityCode]=useState(initialCityCode||"hangzhou");
  const [reverseRequests,setReverseRequests]=useState<OrderReverseResponse[]>([]);
  const [complaints,setComplaints]=useState<AftersaleComplaintResponse[]>([]);
  const [detail,setDetail]=useState<AftersaleComplaintDetailResponse|null>(null);
  const [workerId,setWorkerId]=useState("worker-demo-hangzhou");
  const [compensationAmount,setCompensationAmount]=useState("20");
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setBusy("load");setError(null);
    try{
      window.history.replaceState({},"",`#/aftersale?cityCode=${encodeURIComponent(cityCode)}`);
      const [reverse,complaint]=await Promise.all([
        api.listOrderReverseRequests(),api.listAftersaleComplaints(),
      ]);
      setReverseRequests(reverse.reverseRequests);setComplaints(complaint.complaints);
    }catch(err){setError(err instanceof Error?err.message:"Unable to load aftersale operations");}
    finally{setBusy(null);}
  },[cityCode]);

  const openDetail=useCallback(async(id:string)=>{
    setBusy(id);setError(null);
    try{setDetail((await api.getAftersaleComplaint(id)).detail);}
    catch(err){setError(err instanceof Error?err.message:"Unable to load complaint detail");}
    finally{setBusy(null);}
  },[]);

  useEffect(()=>{void load();},[load]);

  async function mutateReverse(item:OrderReverseResponse,action:"approve"|"reject"|"apply"){
    setBusy(item.reverseRequestId);setError(null);
    try{
      if(action==="apply")await api.applyOrderReverseRequest(item.reverseRequestId);
      else await api.reviewOrderReverseRequest(item.reverseRequestId,{decision:action==="approve"?"approved":"rejected"});
      await load();
    }catch(err){setError(err instanceof Error?err.message:"Reverse operation failed");}
    finally{setBusy(null);}
  }

  async function mutateComplaint(action:"triage"|"repair"|"liability"|"compensation"|"resolve"|"close"){
    if(!detail)return;const id=detail.complaint.complaintId;setBusy(id);setError(null);
    try{
      if(action==="triage")await api.triageAftersaleComplaint(id,{status:"in_progress",priority:detail.complaint.priority,note:"operations accepted complaint"});
      if(action==="repair")await api.createAftersaleRepairOrder(id,{workerId:workerId.trim()||undefined,reason:"complaint repair visit"});
      if(action==="liability")await api.decideAftersaleLiability(id,{liableParty:"no_fault",workerLiabilityPercent:0,platformLiabilityPercent:0,customerLiabilityPercent:0,reason:"initial no-fault decision"});
      if(action==="compensation")await api.proposeAftersaleCompensation(id,{intentType:"service_credit",requestedAmount:Number(compensationAmount)||0,reason:"customer service compensation intent"});
      if(action==="resolve")await api.resolveAftersaleComplaint(id,{resolutionType:"explanation",resolutionNote:"operations resolution recorded"});
      if(action==="close")await api.closeAftersaleComplaint(id);
      await openDetail(id);await load();
    }catch(err){setError(err instanceof Error?err.message:"Complaint operation failed");}
    finally{setBusy(null);}
  }

  async function reviewCompensation(id:string,decision:"approved"|"rejected",amount:number){
    setBusy(id);setError(null);
    try{await api.reviewAftersaleCompensation(id,decision==="approved"?{decision,approvedAmount:amount,decisionNote:"controlled non-executing approval"}:{decision,decisionNote:"rejected by operations"});if(detail)await openDetail(detail.complaint.complaintId);}
    catch(err){setError(err instanceof Error?err.message:"Compensation review failed");}
    finally{setBusy(null);}
  }

  return <div style={{display:"grid",gap:16}}>
    <Card title="Aftersale Operations" actions={<ScopeBadge scope={`city: ${cityCode}`}/>}>
      <div style={{display:"flex",gap:8,alignItems:"end",flexWrap:"wrap"}}>
        <FormField label="City"><Input value={cityCode} onChange={(event)=>setCityCode(event.target.value)}/></FormField>
        <Button variant="primary" disabled={busy!==null} onClick={()=>void load()}>Refresh</Button>
        <StatusTag tone="warning">No provider refund execution</StatusTag>
      </div>
    </Card>
    {error&&<ApiErrorPanel title="Operation failed" detail={error}/>} 
    <Card title="Order Reverse Queue" actions={<StatusTag tone="muted">{reverseRequests.length}</StatusTag>}>
      {reverseRequests.length===0?<EmptyState title="No reverse requests"/>:<Table rows={reverseRequests} getRowKey={(item)=>item.reverseRequestId} columns={[
        {key:"order",title:"Order",render:(item)=>item.orderId},
        {key:"type",title:"Type",render:(item)=>item.reverseType},
        {key:"status",title:"Status",render:(item)=><StatusTag tone={item.status==="applied"?"success":item.status==="rejected"?"danger":"warning"}>{item.status}</StatusTag>},
        {key:"reason",title:"Reason",render:(item)=>item.reason},
        {key:"actions",title:"Actions",render:(item)=><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <Button disabled={item.status!=="requested"||busy===item.reverseRequestId} onClick={()=>void mutateReverse(item,"approve")}>Approve</Button>
          <Button disabled={item.status!=="requested"||busy===item.reverseRequestId} onClick={()=>void mutateReverse(item,"reject")}>Reject</Button>
          <Button variant="primary" disabled={item.status!=="approved"||busy===item.reverseRequestId} onClick={()=>void mutateReverse(item,"apply")}>Apply</Button>
        </div>},
      ]}/>} 
    </Card>
    <Card title="Complaint Queue" actions={<StatusTag tone="muted">{complaints.length}</StatusTag>}>
      {complaints.length===0?<EmptyState title="No complaints"/>:<Table rows={complaints} getRowKey={(item)=>item.complaintId} columns={[
        {key:"id",title:"Complaint",render:(item)=>item.complaintId},
        {key:"order",title:"Order",render:(item)=>item.orderId},
        {key:"category",title:"Category",render:(item)=>item.category},
        {key:"priority",title:"Priority",render:(item)=><StatusTag tone={item.priority==="critical"?"danger":item.priority==="urgent"?"warning":"muted"}>{item.priority}</StatusTag>},
        {key:"status",title:"Status",render:(item)=>item.status},
        {key:"open",title:"",render:(item)=><Button onClick={()=>void openDetail(item.complaintId)}>Open</Button>},
      ]}/>} 
    </Card>
    {detail&&<Card title={`Complaint ${detail.complaint.complaintId}`} actions={<StatusTag tone={detail.complaint.status==="closed"?"success":"primary"}>{detail.complaint.status}</StatusTag>}>
      <div style={{display:"grid",gap:12}}>
        <p style={{margin:0}}>{detail.complaint.description}</p>
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:12}}>
          <FormField label="Repair worker"><Input value={workerId} onChange={(event)=>setWorkerId(event.target.value)}/></FormField>
          <FormField label="Compensation amount"><Input type="number" min="0" value={compensationAmount} onChange={(event)=>setCompensationAmount(event.target.value)}/></FormField>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Button disabled={!["submitted","triaged","waiting_customer"].includes(detail.complaint.status)||busy!==null} onClick={()=>void mutateComplaint("triage")}>Start handling</Button>
          <Button disabled={["closed","rejected"].includes(detail.complaint.status)||busy!==null} onClick={()=>void mutateComplaint("repair")}>Create repair</Button>
          <Button disabled={Boolean(detail.liabilityDecision)||busy!==null} onClick={()=>void mutateComplaint("liability")}>Record liability</Button>
          <Button disabled={["closed","rejected"].includes(detail.complaint.status)||busy!==null} onClick={()=>void mutateComplaint("compensation")}>Propose credit</Button>
          <Button disabled={!["triaged","in_progress","waiting_customer"].includes(detail.complaint.status)||busy!==null} onClick={()=>void mutateComplaint("resolve")}>Resolve</Button>
          <Button variant="primary" disabled={detail.complaint.status!=="resolved"||busy!==null} onClick={()=>void mutateComplaint("close")}>Close</Button>
        </div>
        <Table rows={detail.compensationIntents} getRowKey={(item)=>item.compensationIntentId} emptyText="No compensation intents" columns={[
          {key:"type",title:"Intent",render:(item)=>item.intentType},
          {key:"amount",title:"Amount",render:(item)=>`CNY ${item.requestedAmount.toFixed(2)}`},
          {key:"status",title:"Status",render:(item)=><><StatusTag tone={item.status==="approved"?"success":"warning"}>{item.status}</StatusTag> <StatusTag tone="muted">{item.providerExecutionStatus}</StatusTag></>},
          {key:"review",title:"",render:(item)=><div style={{display:"flex",gap:6}}><Button disabled={item.status!=="proposed"||busy===item.compensationIntentId} onClick={()=>void reviewCompensation(item.compensationIntentId,"approved",item.requestedAmount)}>Approve intent</Button><Button disabled={item.status!=="proposed"||busy===item.compensationIntentId} onClick={()=>void reviewCompensation(item.compensationIntentId,"rejected",0)}>Reject</Button></div>},
        ]}/>
        <Table rows={detail.timeline} getRowKey={(item)=>item.timelineEventId} columns={[
          {key:"time",title:"Time",render:(item)=>item.createdAt},
          {key:"event",title:"Event",render:(item)=>item.eventType},
          {key:"actor",title:"Actor",render:(item)=>`${item.actorType}:${item.actorId||"system"}`},
          {key:"content",title:"Content",render:(item)=>item.content},
        ]}/>
      </div>
    </Card>}
  </div>;
}
