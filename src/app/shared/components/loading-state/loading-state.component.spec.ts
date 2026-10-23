import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoadingStateComponent } from './loading-state.component';

describe('LoadingStateComponent', () => {
  let fixture: ComponentFixture<LoadingStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LoadingStateComponent] }).compileComponents();
    fixture = TestBed.createComponent(LoadingStateComponent);
  });

  it('renders its loading message', () => {
    fixture.componentInstance.message = 'Loading sessions';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading sessions');
  });
});
