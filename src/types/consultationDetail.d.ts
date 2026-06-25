// 详细问诊业务域类型定义
// 对应后端接口：
//   7. GET  /mp/customer/getRequiredQuestionsForDigital → 获取必问问题
//   8. POST /answersheet/basic/batchSaveQuestionAnswer → 批量保存答案
//   9. GET  /mp/customer/getRelationQuestionforDigital → 获取追问问题
//
// ⚠️ 注意：详细问诊接口的字段名带 "h" 后缀（kqihId, koihId），
//    与舌脉接口（kqiId, koiId）不同，需区分使用

// ── 详细问诊选项（带 h 后缀） ──────────────────────────────
export interface IDetailQuestionOption {
  koihId: string                        // 选项 ID
  koihBelongQus: string                 // 所属问题的 kqihId
  koihOption: string                    // 选项文本（如"大便干结"、"较轻"）
  koihOptionCode: string                // 选项编码（如"BDB1"、"BDB1A"）
  koihParentOpid: string | null         // 父选项 ID（子选项才有值）
  koihHasChild: 0 | 1                  // 是否有子选项
  koihChildsOption: IDetailQuestionOption[]  // 子选项列表（较轻/较重）
  koihIsChoose?: '0' | '1' | null      // 是否选中（前端标记用）
  koihOptionMutualExclusion: string[]   // 互斥组标识
  // 以下字段后端返回但前端一般不使用
  koihPatternVal?: string | null
  koihPatternIndex?: string | null
  koihOptionVal?: string
  koihIndex?: string
  koihQuatoCode?: string
  koihOpIllustrate?: string
  koihAddTime?: string
  koihAddUserid?: string
  koihDialecticCount?: string | null
  koihQuatoFilePath?: string | null
}

// ── 详细问诊问题 ──────────────────────────────────────────
export interface IDetailQuestionItem {
  kqihId: string                        // 问题 ID（保存时用作 questionId）
  kqiId: string                         // 另一个 ID（与舌脉接口的 kqiId 对应）
  kqihIndex: string                     // 问题排序索引
  kqihName: string                      // 问题名（如"大便情况"、"寒热表现"）
  kqihCode: string | null               // 问题编码（可能为 null）
  kqihIllustrate: string                // 问题说明（如"便秘，腹泻，不成形"）
  kqihQueType: string                   // 问题类型（"0"=必问, "1"=追问）
  kqihFormulaId?: string | null
  kqihShowFormular: string              // 条件公式（追问用，如"IF(BHR21=1,1,0)"）
  kytOptions: IDetailQuestionOption[]   // 选项列表
  lastChooseOptionIds: string[]         // 上次选中的选项 ID
  // 以下字段后端返回但前端一般不使用
  kqihAddTime?: string | null
  kqihAddUserid?: string | null
  kqihQueModelid?: string | null
}

// ── API 7/9 响应体（获取必问问题 / 获取追问问题） ──────────
export interface IDetailQuestionsResponse {
  status: number
  msg: string
  obj: {
    answerSheetId: string
    questionSeqConfigId: string
    questionList: IDetailQuestionItem[]
  }
}

// ── API 8 保存请求体（批量保存答案） ──────────────────────
// 注意：questionId = kqihId, selectedOptionIds = koihId
// 单选：[子选项 koihId] 或 [选项 koihId]（无子选项时）
// 多选：[子选项 koihId1, 子选项 koihId2, ...] 或 [选项 koihId1, 选项 koihId2, ...]
export interface IBatchSaveAnswer {
  questionId: string                    // 问题的 kqihId
  selectedOptionIds: string[]           // 选中的选项 koihId（子选项优先，无子选项时为父选项）
}

export interface IBatchSaveRequest {
  answerSheetId: string
  kqmId: string
  dialecticCount: string                // 辨证次数（如"1"）
  answers: IBatchSaveAnswer[]
}

// ── API 8 响应体 ──────────────────────────────────────────
export interface IBatchSaveResponse {
  status: number
  msg: string
  obj: null
}
