import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppFeedbackStateComponent } from './app-feedback-state.component';

describe('AppFeedbackStateComponent', () => {
  let fixture: ComponentFixture<AppFeedbackStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppFeedbackStateComponent] }).compileComponents();
    fixture = TestBed.createComponent(AppFeedbackStateComponent);
  });

  it('emits retry for an error state', () => {
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('ion-button') as HTMLElement).click();
    expect(retry).toHaveBeenCalledOnce();
  });
});
