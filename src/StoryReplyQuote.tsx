import {useState} from 'react'
import type {StoryReplyReference} from './campaignStory'

export default function StoryReplyQuote({reply,onOpen}:{reply:StoryReplyReference;onOpen?:()=>void}){
 const [expanded,setExpanded]=useState(false),long=reply.body.length>240,body=long&&!expanded?reply.body.slice(0,240)+'…':reply.body
 return <blockquote className="gb-story-quote" aria-label="Вопрос к этому ответу">
  <small>В ответ: {reply.speaker}{reply.targetLabel&&' → '+reply.targetLabel}</small>
  <p className="w6-prose">{body}</p>
  {(long||onOpen)&&<div className="w6-buttons">
   {long&&<button type="button" className="w6-button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Свернуть вопрос':'Показать весь вопрос'}</button>}
   {onOpen&&<button type="button" className="w6-button" onClick={onOpen}>К вопросу</button>}
  </div>}
 </blockquote>
}
