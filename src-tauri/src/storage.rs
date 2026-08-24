use std::path::Path;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VolumeRoot {
    pub root: String,
    pub id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FolderLocation {
    pub volume_id: Option<String>,
    pub relative_path: Option<String>,
}

pub fn normalize_path(path: &str) -> String {
    let mut normalized = path.replace('\\', "/").trim().to_string();

    if normalized
        .get(..8)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("//?/UNC/"))
    {
        normalized = format!("//{}", &normalized[8..]);
    } else if normalized.starts_with("//?/") {
        normalized = normalized[4..].to_string();
    }

    if normalized.len() > 2 && normalized.as_bytes().get(1) == Some(&b':') {
        let drive_letter = normalized[..1].to_ascii_uppercase();
        normalized.replace_range(0..1, &drive_letter);
    }

    while normalized.ends_with('/') && !is_volume_root(&normalized) && normalized.len() > 1 {
        normalized.pop();
    }

    normalized
}

fn is_volume_root(path: &str) -> bool {
    path.len() == 3 && path.as_bytes().get(1) == Some(&b':') && path.ends_with('/')
}

fn path_equals(left: &str, right: &str) -> bool {
    if cfg!(windows) {
        left.eq_ignore_ascii_case(right)
    } else {
        left == right
    }
}

fn path_starts_with(path: &str, prefix: &str) -> bool {
    if path.len() < prefix.len() {
        return false;
    }
    path.get(..prefix.len())
        .is_some_and(|candidate| path_equals(candidate, prefix))
}

pub fn replace_path_prefix(path: &str, old_root: &str, new_root: &str) -> Option<String> {
    let path = normalize_path(path);
    let old_root = normalize_path(old_root);
    let new_root = normalize_path(new_root);

    if path_equals(&path, &old_root) {
        return Some(new_root);
    }

    let has_folder_boundary = is_volume_root(&old_root)
        || old_root == "/"
        || path.as_bytes().get(old_root.len()) == Some(&b'/');
    if path_starts_with(&path, &old_root) && has_folder_boundary {
        return Some(format!("{}{}", new_root, &path[old_root.len()..]));
    }

    None
}

pub fn is_path_within(path: &str, folder: &str) -> bool {
    replace_path_prefix(path, folder, folder).is_some()
}

fn split_volume_path(path: &str) -> Option<(String, String)> {
    let path = normalize_path(path);
    if path.len() < 3 || path.as_bytes().get(1) != Some(&b':') {
        return None;
    }

    let root = format!("{}:/", &path[..1]);
    let relative = path[3..].trim_start_matches('/').to_string();
    Some((root, relative))
}

pub fn describe_folder(path: &str, roots: &[VolumeRoot]) -> FolderLocation {
    let Some((root, relative_path)) = split_volume_path(path) else {
        return FolderLocation {
            volume_id: None,
            relative_path: None,
        };
    };

    let volume_id = roots
        .iter()
        .find(|candidate| path_equals(&candidate.root, &root))
        .and_then(|candidate| candidate.id.clone());

    FolderLocation {
        volume_id,
        relative_path: Some(relative_path),
    }
}

pub fn resolve_relocated_folder<F>(
    old_path: &str,
    stored_volume_id: Option<&str>,
    stored_relative_path: Option<&str>,
    roots: &[VolumeRoot],
    is_directory: F,
) -> Option<(String, FolderLocation)>
where
    F: Fn(&str) -> bool,
{
    let old_path = normalize_path(old_path);
    if is_directory(&old_path) {
        return None;
    }

    let relative_path = stored_relative_path
        .map(|path| normalize_path(path).trim_start_matches('/').to_string())
        .or_else(|| split_volume_path(&old_path).map(|(_, relative)| relative))?;

    let candidates = if let Some(volume_id) = stored_volume_id {
        roots
            .iter()
            .filter(|root| root.id.as_deref() == Some(volume_id))
            .collect::<Vec<_>>()
    } else {
        // Legacy databases did not store a volume identity. Only repair by
        // suffix when exactly one mounted drive contains the same folder.
        roots.iter().collect::<Vec<_>>()
    };

    let matches = candidates
        .into_iter()
        .filter_map(|root| {
            let candidate = normalize_path(&format!("{}{}", root.root, relative_path));
            is_directory(&candidate).then_some((
                candidate,
                FolderLocation {
                    volume_id: root.id.clone(),
                    relative_path: Some(relative_path.clone()),
                },
            ))
        })
        .collect::<Vec<_>>();

    (matches.len() == 1).then(|| matches[0].clone())
}

#[cfg(windows)]
pub fn mounted_volume_roots() -> Vec<VolumeRoot> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Storage::FileSystem::{GetLogicalDriveStringsW, GetVolumeInformationW};

    unsafe {
        let required = GetLogicalDriveStringsW(0, null_mut());
        if required == 0 {
            return Vec::new();
        }

        let mut buffer = vec![0u16; required as usize + 1];
        let written = GetLogicalDriveStringsW(buffer.len() as u32, buffer.as_mut_ptr());
        if written == 0 {
            return Vec::new();
        }

        buffer[..written as usize]
            .split(|character| *character == 0)
            .filter(|wide| !wide.is_empty())
            .map(|wide| {
                let root = normalize_path(&String::from_utf16_lossy(wide));
                let mut root_wide = wide.to_vec();
                root_wide.push(0);
                let mut serial = 0u32;
                let success = GetVolumeInformationW(
                    root_wide.as_ptr(),
                    null_mut(),
                    0,
                    &mut serial,
                    null_mut(),
                    null_mut(),
                    null_mut(),
                    0,
                );
                VolumeRoot {
                    root,
                    id: (success != 0).then(|| format!("windows-volume-{serial:08X}")),
                }
            })
            .collect()
    }
}

#[cfg(not(windows))]
pub fn mounted_volume_roots() -> Vec<VolumeRoot> {
    Vec::new()
}

pub fn folder_is_available(path: &str) -> bool {
    Path::new(path).is_dir()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn roots() -> Vec<VolumeRoot> {
        vec![
            VolumeRoot {
                root: "C:/".into(),
                id: Some("system".into()),
            },
            VolumeRoot {
                root: "H:/".into(),
                id: Some("external".into()),
            },
            VolumeRoot {
                root: "I:/".into(),
                id: Some("other".into()),
            },
        ]
    }

    #[test]
    fn resolves_same_volume_after_drive_letter_change() {
        let existing = HashSet::from(["H:/Media/Videos"]);
        let resolved = resolve_relocated_folder(
            "F:/Media/Videos",
            Some("external"),
            Some("Media/Videos"),
            &roots(),
            |path| existing.contains(path),
        )
        .expect("resolve moved volume");

        assert_eq!(resolved.0, "H:/Media/Videos");
        assert_eq!(resolved.1.volume_id.as_deref(), Some("external"));
    }

    #[test]
    fn legacy_suffix_repair_requires_one_unambiguous_match() {
        let existing = HashSet::from(["H:/Media", "I:/Media"]);
        assert!(
            resolve_relocated_folder("F:/Media", None, None, &roots(), |path| {
                existing.contains(path)
            })
            .is_none()
        );
    }

    #[test]
    fn prefix_replacement_respects_folder_boundaries() {
        assert_eq!(
            replace_path_prefix("F:/Media/clip.mp4", "F:/Media", "H:/Media").as_deref(),
            Some("H:/Media/clip.mp4")
        );
        assert!(replace_path_prefix("F:/Media-old/clip.mp4", "F:/Media", "H:/Media").is_none());
        assert_eq!(
            replace_path_prefix("F:/clip.mp4", "F:/", "H:/").as_deref(),
            Some("H:/clip.mp4")
        );
    }

    #[test]
    fn normalizes_windows_device_and_unc_prefixes() {
        assert_eq!(normalize_path(r"\\?\f:\Media\"), "F:/Media");
        assert_eq!(
            normalize_path(r"\\?\UNC\server\share\Media"),
            "//server/share/Media"
        );
    }
}
