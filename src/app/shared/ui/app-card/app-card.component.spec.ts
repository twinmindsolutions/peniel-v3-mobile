import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppCardComponent } from './app-card.component';

describe('AppCardComponent', () => {
  let fixture: ComponentFixture<AppCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppCardComponent] }).compileComponents();
    fixture = TestBed.createComponent(AppCardComponent);
  });

  it('creates a surface card', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.card')).toBeTruthy();
  });
});
