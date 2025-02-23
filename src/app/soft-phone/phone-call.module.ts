import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../shared/material.module';
import { PhoneCallRoutingModule } from './phone-call-routing.module';
import { PhoneCallComponent } from './phone-call.component';


@NgModule({
    declarations: [PhoneCallComponent],
    imports: [
        CommonModule,
        ReactiveFormsModule,
        // FormsModule,
        MaterialModule,
        PhoneCallRoutingModule
        // NgbModule,
        // NgSelect2Module
    ],
    exports: [
        PhoneCallComponent
    ]
})
export class PhoneCallModule { }
