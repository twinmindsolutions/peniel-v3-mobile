import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state.component';

describe('EmptyStateComponent', () => {
  let fixture: ComponentFixture<EmptyStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EmptyStateComponent] }).compileComponents();
    fixture = TestBed.createComponent(EmptyStateComponent);
  });

  it('renders title and optional message', () => {
    fixture.componentInstance.title = 'No sessions';
    fixture.componentInstance.message = 'Create a session to begin.';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No sessions');
    expect(fixture.nativeElement.textContent).toContain('Create a session to begin.');
  });
});
