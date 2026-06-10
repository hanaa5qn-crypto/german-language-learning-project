import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PlacementTest from '../frontend/src/PlacementTest';
import { PLACEMENT_BLOCKS, PlacementRecord } from '../frontend/src/placement';

// Нэг асуултад хариулаад "Дараах" дарна. `correctly` нь зөв/буруу сонголтыг
// удирдана.
function answerQuestion(blockIdx: number, questionIdx: number, correctly: boolean) {
  const q = PLACEMENT_BLOCKS[blockIdx][questionIdx];
  const choiceIdx = correctly ? q.correctIndex : (q.correctIndex + 1) % q.choices.length;
  fireEvent.click(screen.getByText(q.choices[choiceIdx]));
  fireEvent.click(screen.getByText('Дараах'));
}

function answerAllBlocksCorrectly() {
  for (let b = 0; b < PLACEMENT_BLOCKS.length; b++) {
    for (let qIdx = 0; qIdx < PLACEMENT_BLOCKS[b].length; qIdx++) {
      answerQuestion(b, qIdx, true);
    }
  }
}

describe('PlacementTest flow', () => {
  it('hides the price until the test is finished, then asks 5000₮ to reveal', () => {
    const onFinish = vi.fn();
    render(<PlacementTest isFounder={false} onFinish={onFinish} onSkip={() => {}} />);

    // Танилцуулга дээр үнийн мэдээлэл байх ёсгүй.
    expect(screen.queryByText(/5,?000₮/)).toBeNull();
    fireEvent.click(screen.getByText('Тест эхлүүлэх'));
    expect(screen.queryByText(/5,?000₮/)).toBeNull();

    answerAllBlocksCorrectly();

    // Тест дууссаны дараа л үнэ харагдана; түвшин түгжээтэй хэвээр.
    expect(screen.getByText('Тест дууслаа! 🎉')).toBeTruthy();
    expect(screen.getAllByText(/5,?000₮/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Таны түвшин')).toBeNull();

    // Үр дүнг нээлгүй гарахад unlocked=false бичлэгтэй дуусна.
    fireEvent.click(screen.getByText(/Үр дүнг нээлгүй үргэлжлүүлэх/));
    expect(onFinish).toHaveBeenCalledTimes(1);
    const record = onFinish.mock.calls[0][0] as PlacementRecord;
    expect(record.unlocked).toBe(false);
    expect(record.level).toBe('C2');
    cleanup();
  });

  it('unlocks the result for founder accounts without payment', () => {
    const onFinish = vi.fn();
    render(<PlacementTest isFounder={true} onFinish={onFinish} onSkip={() => {}} />);

    fireEvent.click(screen.getByText('Тест эхлүүлэх'));
    answerAllBlocksCorrectly();

    // Төлбөрийн шат алгасагдаж, үр дүн шууд нээгдэнэ.
    expect(screen.getByText(/Founder — төлбөргүй нээгдлээ/)).toBeTruthy();
    expect(screen.getByText('Таны түвшин')).toBeTruthy();
    expect(screen.getByText('C2')).toBeTruthy();

    fireEvent.click(screen.getByText(/түвшнээс суралцаж эхлэх/));
    const record = onFinish.mock.calls[0][0] as PlacementRecord;
    expect(record.unlocked).toBe(true);
    expect(record.unlockedBy).toBe('founder');
    cleanup();
  });

  it('stops early when the first block is failed', () => {
    const onFinish = vi.fn();
    render(<PlacementTest isFounder={true} onFinish={onFinish} onSkip={() => {}} />);

    fireEvent.click(screen.getByText('Тест эхлүүлэх'));
    for (let qIdx = 0; qIdx < PLACEMENT_BLOCKS[0].length; qIdx++) {
      answerQuestion(0, qIdx, false);
    }

    // Эхний блок унавал A1 түвшинд тогтоож тест дуусна.
    expect(screen.getByText('Таны түвшин')).toBeTruthy();
    fireEvent.click(screen.getByText(/түвшнээс суралцаж эхлэх/));
    const record = onFinish.mock.calls[0][0] as PlacementRecord;
    expect(record.level).toBe('A1');
    expect(record.totalQuestions).toBe(4);
    cleanup();
  });
});
