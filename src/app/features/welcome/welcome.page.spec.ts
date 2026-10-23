import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { WelcomeStateService } from '../../core/launch/welcome-state.service';
import { WelcomePage } from './welcome.page';

describe('WelcomePage', () => {
  let fixture: ComponentFixture<WelcomePage>;
  const welcomeState = { complete: vi.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WelcomePage],
      providers: [provideRouter([]), { provide: WelcomeStateService, useValue: welcomeState }],
    }).compileComponents();
    fixture = TestBed.createComponent(WelcomePage);
  });

  it('persists completion before navigating to login', async () => {
    const router = TestBed.inject(Router);
    const navigation = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    await fixture.componentInstance.getStarted();
    expect(welcomeState.complete).toHaveBeenCalledOnce();
    expect(navigation).toHaveBeenCalledWith('/auth/login');
  });
});
