import { useRef, useState } from "react";
import { uploadImage } from "../api/adminApi";
import ImageCropper from "./ImageCropper";
import { cropHint } from "../utils/imageSizes";

/* eslint-disable react/prop-types */

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/* One independent image slot: choose a file → crop to the fixed size → upload to Cloudinary.
   value is { url, publicId, alt } or null; onChange receives the new value (null on remove).
   onBusyChange lets the parent form block saving while an upload is in flight. */
export default function CroppedImageField({ id, label, help, kind, output, value, alt, onChange, onBusyChange, wide = false, round = false }) {
  const [cropSource, setCropSource] = useState(null);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) return setError("Choose a JPG, PNG or WebP image.");
    if (file.size > MAX_SOURCE_BYTES) return setError("That file is larger than 25 MB.");
    setError("");
    setCropSource(file);
  }

  async function upload(file) {
    onBusyChange?.(true);
    try {
      const result = await uploadImage(file, kind);
      onChange({ url: result.url, publicId: result.publicId, alt });
      setCropSource(null);
      setError("");
    } catch (uploadError) {
      setError(uploadError.message);
      setCropSource(null);
    } finally {
      onBusyChange?.(false);
    }
  }

  return (
    <div className={`cif${wide ? " cif-wide" : ""}${round ? " cif-round" : ""}`}>
      <span className="cif-label" id={`${id}-label`}>{label}</span>
      <div className="cif-preview" style={{ aspectRatio: `${output.width} / ${output.height}` }}>
        {value?.url
          ? <img src={value.url} alt={`${label} preview`} />
          : <span className="cif-empty">No image</span>}
      </div>
      <div className="cif-actions">
        <button type="button" className="cm-secondary-btn cif-btn" onClick={() => inputRef.current?.click()} aria-describedby={`${id}-label`}>{value?.url ? "Replace" : "Upload"}</button>
        <input ref={inputRef} id={id} type="file" accept={ACCEPT} onChange={chooseFile} aria-labelledby={`${id}-label`} hidden />
        {value?.url && <button type="button" className="cm-secondary-btn cif-btn" onClick={() => setCropSource(value.url)}>Crop</button>}
        {value?.url && <button type="button" className="cm-secondary-btn cif-btn cif-remove" onClick={() => { setError(""); onChange(null); }}>Remove</button>}
      </div>
      <p className="cm-image-help">{help || cropHint(output)}</p>
      {error && <p className="cif-error" role="alert">{error}</p>}
      {cropSource && <ImageCropper
        source={cropSource}
        title={label}
        aspect={output.width / output.height}
        output={output}
        onCancel={() => setCropSource(null)}
        onConfirm={upload}
      />}
    </div>
  );
}
