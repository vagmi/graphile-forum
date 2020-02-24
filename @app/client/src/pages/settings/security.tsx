import React, { useState, useCallback, useMemo, SyntheticEvent } from "react";
import SettingsLayout from "../../layout/SettingsLayout";
import { NextPage } from "next";
import {
  useChangePasswordMutation,
  useSettingsPasswordQuery,
  useForgotPasswordMutation,
} from "@app/graphql";
import { promisify } from "util";
import { Form, Input, Alert, Button } from "antd";
import { ApolloError } from "apollo-client";
import { FormComponentProps, ValidateFieldsOptions } from "antd/lib/form/Form";
import { getCodeFromError, extractError } from "../../errors";
import { formItemLayout, tailFormItemLayout } from "../../forms";
import { H3, P, ErrorAlert, PasswordStrength } from "@app/components";
import Link from "next/link";
import { setPasswordInfo } from "../../lib/passwordHelpers";

const Settings_Security: NextPage = () => {
  const [error, setError] = useState<Error | ApolloError | null>(null);
  const [strength, setStrength] = useState<number>(0);
  const [passwordSuggestions, setPasswordSuggestions] = useState<string[]>([]);

  return (
    <SettingsLayout href="/settings/security">
      <WrappedChangePasswordForm
        error={error}
        setError={setError}
        passwordStrength={strength}
        setPasswordStrength={setStrength}
        passwordSuggestions={passwordSuggestions}
        setPasswordSuggestions={setPasswordSuggestions}
      />
    </SettingsLayout>
  );
};

export default Settings_Security;

/**
 * These are the values in our form
 */
interface FormValues {
  oldPassword: string;
  newPassword: string;
}

interface ChangePasswordFormProps extends FormComponentProps<FormValues> {
  error: Error | ApolloError | null;
  setError: (error: Error | ApolloError | null) => void;
  passwordStrength: number;
  setPasswordStrength: (strength: number) => void;
  passwordSuggestions: string[];
  setPasswordSuggestions: (suggestions: string[]) => void;
}

function ChangePasswordForm({
  form,
  error,
  setError,
  passwordStrength,
  passwordSuggestions,
}: ChangePasswordFormProps) {
  const [changePassword] = useChangePasswordMutation();
  const [success, setSuccess] = useState(false);
  const validateFields: (
    fieldNames?: Array<string>,
    options?: ValidateFieldsOptions
  ) => Promise<FormValues> = useMemo(
    () => promisify((...args) => form.validateFields(...args)),
    [form]
  );

  const handleSubmit = useCallback(
    async (e: SyntheticEvent) => {
      e.preventDefault();
      setSuccess(false);
      setError(null);
      try {
        const values = await validateFields();
        await changePassword({
          variables: {
            oldPassword: values.oldPassword,
            newPassword: values.newPassword,
          },
        });
        setError(null);
        setSuccess(true);
      } catch (e) {
        const errcode = getCodeFromError(e);
        if (errcode === "WEAKP") {
          form.setFields({
            newPassword: {
              value: form.getFieldValue("newPassword"),
              errors: [
                new Error(
                  "The server believes this passphrase is too weak, please make it stronger"
                ),
              ],
            },
          });
        } else if (errcode === "CREDS") {
          form.setFields({
            oldPassword: {
              value: form.getFieldValue("oldPassword"),
              errors: [new Error("Incorrect old passphrase")],
            },
          });
        } else {
          setError(e);
        }
      }
    },
    [changePassword, form, setError, validateFields]
  );

  const {
    data,
    error: graphqlQueryError,
    loading,
  } = useSettingsPasswordQuery();
  const [forgotPassword] = useForgotPasswordMutation();
  const u = data && data.currentUser;
  const userEmail = u && u.userEmails.nodes[0];
  const email = userEmail ? userEmail.email : null;
  const [resetInProgress, setResetInProgress] = useState(false);
  const [resetError, setResetError] = useState(null);
  const handleResetPassword = useCallback(() => {
    if (!email) return;
    if (resetInProgress) return;
    (async () => {
      setResetInProgress(true);

      try {
        await forgotPassword({ variables: { email } });
      } catch (e) {
        setResetError(resetError);
      }
      setResetInProgress(false);
    })();
  }, [email, forgotPassword, resetError, resetInProgress]);

  const [passwordIsFocussed, setPasswordIsFocussed] = useState(false);
  const setPasswordFocussed = useCallback(() => {
    setPasswordIsFocussed(true);
  }, [setPasswordIsFocussed]);
  const setPasswordNotFocussed = useCallback(() => {
    setPasswordIsFocussed(false);
  }, [setPasswordIsFocussed]);

  const { getFieldDecorator } = form;
  if (loading) {
    /* noop */
  } else if (graphqlQueryError) {
    return <ErrorAlert error={graphqlQueryError} />;
  } else if (data && data.currentUser && !data.currentUser.hasPassword) {
    return (
      <div>
        <H3>Change passphrase</H3>
        <P>
          You registered your account through social login, so you do not
          currently have a passphrase. If you would like a passphrase, press the
          button below to request a passphrase reset email to '{email}' (you can
          choose a different email by making it primary in{" "}
          <Link href="/settings/emails">email settings</Link>).
        </P>
        <Button onClick={handleResetPassword} disabled={resetInProgress}>
          Reset passphrase
        </Button>
      </div>
    );
  }

  const code = getCodeFromError(error);
  return (
    <div>
      <H3>Change passphrase</H3>
      <Form {...formItemLayout} onSubmit={handleSubmit}>
        <Form.Item label="Old passphrase">
          {getFieldDecorator("oldPassword", {
            rules: [
              {
                required: true,
                message: "Please input your passphrase",
              },
            ],
          })(<Input type="password" />)}
        </Form.Item>
        <Form.Item label="New passphrase">
          {getFieldDecorator("newPassword", {
            rules: [
              {
                required: true,
                message: "Please confirm your passphrase",
              },
            ],
          })(
            <Input
              type="password"
              onFocus={setPasswordFocussed}
              onBlur={setPasswordNotFocussed}
            />
          )}
          <PasswordStrength
            passwordStrength={passwordStrength}
            suggestions={passwordSuggestions}
            isDirty={form.isFieldTouched("newPassword")}
            isFocussed={passwordIsFocussed}
          />
        </Form.Item>
        {error ? (
          <Form.Item>
            <Alert
              type="error"
              message={`Changing passphrase failed`}
              description={
                <span>
                  {extractError(error).message}
                  {code ? (
                    <span>
                      {" "}
                      (Error code: <code>ERR_{code}</code>)
                    </span>
                  ) : null}
                </span>
              }
            />
          </Form.Item>
        ) : success ? (
          <Form.Item>
            <Alert type="success" message={`Password changed!`} />
          </Form.Item>
        ) : null}
        <Form.Item {...tailFormItemLayout}>
          <Button htmlType="submit">Change Passphrase</Button>
        </Form.Item>
      </Form>
    </div>
  );
}

const WrappedChangePasswordForm = Form.create<ChangePasswordFormProps>({
  name: "changePasswordForm",
  onValuesChange(props) {
    props.setError(null);
  },
  onFieldsChange(props, changedValues) {
    setPasswordInfo(props, changedValues, "newPassword");
  },
})(ChangePasswordForm);
