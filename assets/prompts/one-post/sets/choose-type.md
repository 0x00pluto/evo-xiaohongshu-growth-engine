根据稿面、封面那句话和封面之外的张数，在允许列表里选一个系列类型。

本期允许列表只有 breakdown。不要发明列表外的类型，不要返回空字符串，也不要返回多个类型。

标题：{{title}}
正文：{{body}}
话题：{{topics}}
封面那句话：{{coverLine}}
封面之外的张数：{{galleryCount}}

只返回一个 JSON 对象，不要 Markdown 围栏，不要额外说明。字段 type 只能是 breakdown。

返回示例：
{"type":"breakdown"}
示例只说明字段形状。
