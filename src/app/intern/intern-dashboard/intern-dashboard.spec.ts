import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InternDashboard } from './intern-dashboard';

describe('InternDashboard', () => {
  let component: InternDashboard;
  let fixture: ComponentFixture<InternDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InternDashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InternDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
