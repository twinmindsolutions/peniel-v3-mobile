import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppPageShellComponent } from './app-page-shell.component';

describe('AppPageShellComponent', () => {
  let fixture: ComponentFixture<AppPageShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppPageShellComponent] }).compileComponents();
    fixture = TestBed.createComponent(AppPageShellComponent);
  });

  it('renders its page heading content', () => {
    fixture.componentInstance.title = 'Sign in';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sign in');
  });
});
