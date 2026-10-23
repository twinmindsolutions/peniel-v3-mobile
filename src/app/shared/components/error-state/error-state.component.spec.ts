import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ErrorStateComponent } from './error-state.component';

describe('ErrorStateComponent', () => {
  let fixture: ComponentFixture<ErrorStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ErrorStateComponent] }).compileComponents();
    fixture = TestBed.createComponent(ErrorStateComponent);
  });

  it('emits retry when requested', () => {
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('ion-button') as HTMLElement).click();
    expect(retry).toHaveBeenCalledOnce();
  });
});
