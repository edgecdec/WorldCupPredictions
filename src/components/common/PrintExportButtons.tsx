'use client';
import { useCallback, useRef, useState } from 'react';
import { Button, ButtonGroup, CircularProgress } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import ImageIcon from '@mui/icons-material/Image';
import html2canvas from 'html2canvas';

interface PrintExportButtonsProps {
  /** Ref to the DOM element to capture for image export */
  targetRef: React.RefObject<HTMLElement | null>;
  /** Filename for the exported image (without extension) */
  filename?: string;
}

export default function PrintExportButtons({ targetRef, filename = 'bracket' }: PrintExportButtonsProps) {
  const [exporting, setExporting] = useState(false);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleExport = useCallback(async () => {
    if (!targetRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(targetRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // silent fail
    } finally {
      setExporting(false);
    }
  }, [targetRef, filename]);

  return (
    <ButtonGroup variant="outlined" size="small" className="no-print">
      <Button startIcon={<PrintIcon />} onClick={handlePrint}>
        Print
      </Button>
      <Button
        startIcon={exporting ? <CircularProgress size={16} /> : <ImageIcon />}
        onClick={handleExport}
        disabled={exporting}
      >
        {exporting ? 'Exporting…' : 'Save Image'}
      </Button>
    </ButtonGroup>
  );
}
