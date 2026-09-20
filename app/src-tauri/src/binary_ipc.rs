//! Tauri uses JSON byte arrays on Android and raw bytes on desktop.
use std::borrow::Cow;
use tauri::ipc::InvokeBody;

pub fn decode(body: &InvokeBody, max: usize) -> Result<Cow<'_, [u8]>, String> {
    match body {
        InvokeBody::Raw(bytes) if bytes.len() <= max => Ok(Cow::Borrowed(bytes)),
        InvokeBody::Raw(_) => Err("The selected file is too large.".into()),
        InvokeBody::Json(value) => {
            let values = value.as_array().ok_or("Expected file bytes.")?;
            if values.len() > max {
                return Err("The selected file is too large.".into());
            }
            values
                .iter()
                .map(|value| {
                    value
                        .as_u64()
                        .and_then(|n| u8::try_from(n).ok())
                        .ok_or_else(|| "Invalid file bytes.".to_string())
                })
                .collect::<Result<Vec<_>, _>>()
                .map(Cow::Owned)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn android_and_desktop_preserve_every_byte() {
        let bytes: Vec<u8> = (0..=255).cycle().take(crate::ROM_LEN).collect();
        let raw = InvokeBody::Raw(bytes.clone());
        let json = InvokeBody::Json(bytes.clone().into());
        assert_eq!(&*decode(&raw, crate::ROM_LEN).unwrap(), bytes);
        assert_eq!(&*decode(&json, crate::ROM_LEN).unwrap(), bytes);
        assert!(matches!(
            decode(&raw, crate::ROM_LEN).unwrap(),
            Cow::Borrowed(_)
        ));
    }

    #[test]
    fn rejects_malformed_android_bytes() {
        for body in [
            InvokeBody::Json(vec![-1].into()),
            InvokeBody::Json(vec![256].into()),
            InvokeBody::Json(vec![1.5].into()),
            InvokeBody::Json(vec!["1"].into()),
            InvokeBody::Json(vec![true].into()),
        ] {
            assert!(decode(&body, 10).is_err());
        }
        assert!(decode(&InvokeBody::Json("not bytes".into()), 10).is_err());
    }

    #[test]
    fn bounds_both_transports_before_copying() {
        for body in [
            InvokeBody::Raw(vec![1, 2]),
            InvokeBody::Json(vec![1, 2].into()),
        ] {
            assert!(decode(&body, 1).is_err());
            assert_eq!(&*decode(&body, 2).unwrap(), &[1, 2]);
        }
    }
}
