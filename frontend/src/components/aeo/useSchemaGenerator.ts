import { useState } from 'react';

export const useSchemaGenerator = () => {
  const [schemaData, setSchemaData] = useState<any>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [schemaFormat, setSchemaFormat] = useState<'json-ld' | 'rdfa'>('json-ld');
  const [selectedSchemaType, setSelectedSchemaType] = useState<string>('auto');

  const generateSchema = async (url: string) => {
    if (!url) return;

    setSchemaLoading(true);
    setSchemaError(null);

    try {
      const response = await fetch('/api/aeo/generate-schema', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          schema_type: selectedSchemaType
        }),
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        setSchemaData(data.results);
      } else {
        setSchemaError(data.error || 'Failed to generate schema');
      }
    } catch (error: any) {
      setSchemaError(error.message || 'Failed to generate schema');
    } finally {
      setSchemaLoading(false);
    }
  };

  const copySchemaToClipboard = () => {
    const textToCopy = schemaFormat === 'json-ld'
      ? (schemaData?.schema_text ?? schemaData?.schemaText ?? schemaData?.json_ld)
      : (schemaData?.rdfa_markup ?? schemaData?.rdfaMarkup ?? schemaData?.rdfa);
    if (!textToCopy || typeof textToCopy !== 'string') return;

    const doCopy = (text: string) => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          setCopiedSchema(true);
          setTimeout(() => setCopiedSchema(false), 2000);
        }).catch(() => fallbackCopy(text));
      } else {
        fallbackCopy(text);
      }
    };

    const fallbackCopy = (text: string) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopiedSchema(true);
        setTimeout(() => setCopiedSchema(false), 2000);
      } catch {
        // ignore
      }
      document.body.removeChild(ta);
    };

    doCopy(textToCopy);
  };

  return {
    schemaData,
    schemaLoading,
    schemaError,
    copiedSchema,
    schemaFormat,
    selectedSchemaType,
    setSchemaFormat,
    setSelectedSchemaType,
    generateSchema,
    copySchemaToClipboard
  };
};