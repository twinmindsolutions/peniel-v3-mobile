import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppFormFieldComponent } from './app-form-field.component';

describe('AppFormFieldComponent', () => {
  let fixture: ComponentFixture<AppFormFieldComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppFormFieldComponent] }).compileComponents();
    fixture = TestBed.createComponent(AppFormFieldComponent);
  });

  it('renders validation feedback', () => {
    fixture.componentInstance.label = 'Email';
    fixture.componentInstance.error = 'Enter an email address.';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Enter an email address.');
  });

  it('supports a reusable trailing control slot', () => {
    fixture.componentInstance.hasTrailingControl = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.control--trailing')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.field-suffix')).toBeTruthy();
  });
});
