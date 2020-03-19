/**
 * @license
 * Copyright 2019 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Auth } from '../../src';
import { AuthProvider } from '../core/providers';
import { PopupRedirectResolver, PopupRedirectOutcomeHandler } from '../model/popup_redirect_resolver';
import { AuthEventType, AuthEvent } from '../model/auth_event';
import { UserCredential } from '../model/user_credential';
import { RedirectManager } from './strategies/redirect';
import * as idp from './strategies/idp';
import { User } from '../model/user';
import { AuthPopup } from './util/popup';
import { PopupResultManager } from './strategies/popup';
import { AUTH_ERROR_FACTORY, AuthErrorCode } from './errors';

export abstract class AbstractPopupRedirectResolver
  implements PopupRedirectResolver {
  private readonly redirectOutcomeHandler = new RedirectManager();
  private readonly popupOutcomeHandler = new PopupResultManager();
  private auth!: Auth;

  abstract openPopup(
    auth: Auth,
    provider: AuthProvider,
    authType: AuthEventType,
    eventId?: string
  ): Promise<AuthPopup>;

  abstract processRedirect(
    auth: Auth,
    provider: AuthProvider,
    authType: AuthEventType
  ): Promise<never>;

  abstract initializeAndWait(auth: Auth): Promise<void>;
  abstract isInitialized(): boolean;

  async onEvent(event: AuthEvent): Promise<boolean> {
    if (event.error && event.type !== AuthEventType.UNKNOWN) {
      this.getOutcomeHandler(event.type).broadcastResult(null, event.error);
      return true;
    }

    const potentialUser = this.userForEvent(event.eventId);

    switch (event.type) {
      case AuthEventType.SIGN_IN_VIA_POPUP:
        if (!this.popupOutcomeHandler.isMatchingEvent(event.eventId)) {
          break;
        }
        // Fallthrough
      case AuthEventType.SIGN_IN_VIA_REDIRECT:
        this.execIdpTask(event, idp.signIn);
        break;
      case AuthEventType.LINK_VIA_POPUP:
      case AuthEventType.LINK_VIA_REDIRECT:
        if (potentialUser) {
          this.execIdpTask(event, idp.link, potentialUser);
        }
        break;
      case AuthEventType.REAUTH_VIA_POPUP:
      case AuthEventType.REAUTH_VIA_REDIRECT:
        if (potentialUser) {
          this.execIdpTask(event, idp.reauth, potentialUser);
        }
        break;
    }

    // Always resolve with the iframe
    return true;
  }

  processPopup(
    auth: Auth,
    provider: AuthProvider,
    authType: AuthEventType,
    eventId?: string
  ): Promise<UserCredential | null> {
    // TODO: Fix the dirty hack
    this.auth = auth;

    return this.popupOutcomeHandler.getNewPendingPromise(async () => {
      if (!this.isInitialized()) {
        await this.initializeAndWait(auth);
      }

      const win = await this.openPopup(auth, provider, authType, eventId);
      win.associatedEvent = eventId || null;
      return win;
    });
  }

  getRedirectResult(auth: Auth): Promise<UserCredential | null> {
    // TODO: Fix this dirty hack
    this.auth = auth;
    return this.redirectOutcomeHandler.getRedirectPromiseOrInit(() => {
      if (!this.isInitialized()) {
        this.initializeAndWait(auth);
      }
    });
  }

  private userForEvent(id: string|null): User | undefined {
    return this.auth
      .getPotentialRedirectUsers_()
      .find(u => u.redirectEventId_ === id);
  }

  private getOutcomeHandler(eventType: AuthEventType): PopupRedirectOutcomeHandler {
    switch (eventType) {
      case AuthEventType.SIGN_IN_VIA_POPUP:
      case AuthEventType.LINK_VIA_POPUP:
      case AuthEventType.REAUTH_VIA_POPUP:
        return this.popupOutcomeHandler;
      case AuthEventType.SIGN_IN_VIA_REDIRECT:
      case AuthEventType.LINK_VIA_REDIRECT:
      case AuthEventType.REAUTH_VIA_REDIRECT:
        return this.redirectOutcomeHandler;
      default:
        throw AUTH_ERROR_FACTORY.create(AuthErrorCode.INTERNAL_ERROR, {
          appName: 'TODO',
        });
    }
  }

  private async execIdpTask(
    event: AuthEvent,
    task: idp.IdpTask,
    user?: User
  ) {
    const { urlResponse, sessionId, postBody, tenantId } = event;
    const params: idp.IdpTaskParams = {
      requestUri: urlResponse!,
      sessionId: sessionId!,
      auth: this.auth,
      tenantId: tenantId || undefined,
      postBody: postBody || undefined,
      user
    };

    const outcomeHandler = this.getOutcomeHandler(event.type);

    try {
      const cred = await task(params);
      outcomeHandler.broadcastResult(cred);
    } catch (e) {
      outcomeHandler.broadcastResult(null, e);
    }
  }
}