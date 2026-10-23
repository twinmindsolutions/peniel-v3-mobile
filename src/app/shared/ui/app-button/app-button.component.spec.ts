import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppButtonComponent } from './app-button.component';

describe('AppButtonComponent', () => {
  let fixture: ComponentFixture<AppButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppButtonComponent] }).compileComponents();
    fixture = TestBed.createComponent(AppButtonComponent);
  });

  it('renders a loading state and disables the button', () => {
    fixture.componentInstance.loading = true;
    fixture.detectChanges();
    expect(fixture.componentInstance.loading).toBe(true);
    expect(fixture.nativeElement.querySelector('ion-spinner')).toBeTruthy();
  });

  it('supports the shared navy action treatment', () => {
    fixture.componentInstance.variant = 'navy';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.button--navy')).toBeTruthy();
  });
});
