use serde_json::Value;
use std::collections::{HashMap, HashSet};

fn text(v: &Value) -> bool { v.as_str().is_some_and(|s| !s.trim().is_empty()) }
fn date(v: &Value) -> bool { v.as_str().is_some_and(crate::history::valid_date) }
fn clock(v: &Value) -> bool {
    v.as_str().is_some_and(|s| {
        let b = s.as_bytes();
        b.len() == 5 && b[2] == b':' && b.iter().enumerate().all(|(i, c)| i == 2 || c.is_ascii_digit())
            && s[..2].parse::<u8>().is_ok_and(|h| h < 24) && s[3..].parse::<u8>().is_ok_and(|m| m < 60)
    })
}
fn stamp(v: &Value) -> bool {
    v.as_str().is_some_and(|s| {
        let b = s.as_bytes();
        (b.len() == 20 || b.len() == 24) && s.is_ascii() && b[10] == b'T' && b[16] == b':' && b[b.len()-1] == b'Z'
            && crate::history::valid_date(&s[..10]) && clock(&Value::String(s[11..16].into()))
            && s[17..19].parse::<u8>().is_ok_and(|n| n < 60)
            && (b.len() == 20 || (b[19] == b'.' && b[20..23].iter().all(u8::is_ascii_digit)))
    })
}
fn optional(v: &Value, key: &str, valid: impl Fn(&Value) -> bool) -> bool { v.get(key).is_none_or(valid) }
fn strings(v: &Value, valid: impl Fn(&Value) -> bool) -> bool {
    v.as_array().is_some_and(|items| {
        let mut seen = HashSet::new();
        items.iter().all(|item| valid(item) && seen.insert(item.to_string()))
    })
}

pub(crate) fn validate(value: &Value) -> Result<(), String> {
    let error = "日程数据无法完整读取，停止保存以保护原内容";
    let events = value["events"].as_array().ok_or(error)?;
    let batches = value["batches"].as_array().ok_or(error)?;
    let receipts = value["receipts"].as_array().ok_or(error)?;
    let mut ids = HashMap::new();
    for e in events {
        if !text(&e["id"]) || !date(&e["date"]) || !matches!(e["period"].as_str(), Some("morning"|"afternoon"|"evening"))
            || !text(&e["text"]) || !e["completed"].is_boolean() || !stamp(&e["createdAt"]) || !stamp(&e["updatedAt"])
            || !optional(e,"startTime",clock) || !optional(e,"endTime",|v| clock(v) && clock(&e["startTime"]) && v != &e["startTime"])
            || !optional(e,"deadline",|v| v.as_bool().is_some_and(|b| !b || (clock(&e["startTime"]) && e.get("endTime").is_none())))
            || !optional(e,"taskId",text) || !optional(e,"batchId",text) || !optional(e,"sourceText",Value::is_string)
            || !optional(e,"completedDates",|v| strings(v,date))
            || !optional(e,"repeat",|v| matches!(v.as_str(),Some("none"|"daily"|"weekly")))
            || !optional(e,"remindMinutes",|v| v.as_u64().is_some_and(|n| n <= 1440))
            || ids.insert(e["id"].as_str().ok_or(error)?, e).is_some() { return Err(error.into()); }
    }
    let mut batch_ids = HashSet::new();
    let mut owners = HashMap::new();
    for b in batches {
        if !text(&b["id"]) || !stamp(&b["createdAt"]) || !optional(b,"undoneAt",stamp) || !strings(&b["eventIds"],text)
            || !batch_ids.insert(b["id"].as_str().ok_or(error)?) { return Err(error.into()); }
        for id in b["eventIds"].as_array().ok_or(error)? {
            let id = id.as_str().ok_or(error)?;
            if owners.insert(id, &b["id"]).is_some() || ids.get(id).is_some_and(|e| e["batchId"] != b["id"]) { return Err(error.into()); }
        }
    }
    for e in events {
        if let Some(batch) = e.get("batchId") {
            if owners.get(e["id"].as_str().ok_or(error)?).is_none_or(|owner| *owner != batch) { return Err(error.into()); }
        }
    }
    let mut delivered = HashSet::new();
    for r in receipts {
        if !text(&r["eventId"]) || !date(&r["occurrenceDate"]) || !stamp(&r["scheduledTime"])
            || !delivered.insert((r["eventId"].to_string(),r["occurrenceDate"].to_string(),r["scheduledTime"].to_string())) { return Err(error.into()); }
    }
    Ok(())
}

pub(crate) fn deserialize<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Option<Value>, D::Error> {
    use serde::Deserialize;
    let value = Value::deserialize(deserializer)?;
    validate(&value).map_err(serde::de::Error::custom)?;
    Ok(Some(value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn rejects_malformed_times_ids_and_batch_ownership() {
        let mut a = json!({"events":[{"id":"e","date":"2026-11-14","period":"afternoon","startTime":"14:30","text":"meeting","completed":false,"createdAt":"2026-11-14T00:00:00.000Z","updatedAt":"2026-11-14T00:00:00.000Z"}],"batches":[],"receipts":[]});
        assert!(validate(&a).is_ok());
        a["events"][0]["startTime"] = json!("25:00"); assert!(validate(&a).is_err());
        a["events"][0]["startTime"] = json!("14:30"); a["events"][0]["batchId"] = json!("missing"); assert!(validate(&a).is_err());
        a["batches"] = json!([{"id":"missing","createdAt":"2026-11-14T00:00:00Z","eventIds":["e"]}]); assert!(validate(&a).is_ok());
    }
}
