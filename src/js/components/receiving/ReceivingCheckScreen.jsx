import arrayMutators from 'final-form-arrays';
import update from 'immutability-helper';
import _ from 'lodash';
import PropTypes from 'prop-types';
import React, { Component } from 'react';
import { confirmAlert } from 'react-confirm-alert';
import { Form } from 'react-final-form';
import { connect } from 'react-redux';
import { hideSpinner, showSpinner } from '../../actions';
import apiClient, { flattenRequest, parseResponse } from '../../utils/apiClient';
import { renderFormField } from '../../utils/form-utils';
import Translate from '../../utils/Translate';
import ArrayField from '../form-elements/ArrayField';
import CheckboxField from '../form-elements/CheckboxField';
import DateField from '../form-elements/DateField';
import LabelField from '../form-elements/LabelField';
import TableRowWithSubfields from '../form-elements/TableRowWithSubfields';
import TextField from '../form-elements/TextField';

const SHIPMENT_FIELDS = {
  'origin.name': {
    label: 'react.partialReceiving.origin.label',
    defaultMessage: 'Origin',
    type: params => <TextField {...params} disabled />,
  },
  'destination.name': {
    label: 'react.partialReceiving.destination.label',
    defaultMessage: 'Destination',
    type: params => <TextField {...params} disabled />,
  },
  dateShipped: {
    label: 'react.partialReceiving.shippedOn.label',
    defaultMessage: 'Shipped on',
    type: params => <DateField {...params} disabled />,
  },
  dateDelivered: {
    label: 'react.partialReceiving.deliveredOn.label',
    defaultMessage: 'Delivered on',
    type: params => <DateField {...params} disabled />,
  },
};

const TABLE_FIELDS = {
  containers: {
    type: ArrayField,
    maxTableHeight: 'none',
    rowComponent: TableRowWithSubfields,
    subfieldKey: 'shipmentItems',
    fields: {
      'parentContainer.name': {
        fieldKey: '',
        type: params => (!params.subfield ? <LabelField {...params} /> : null),
        label: 'react.partialReceiving.packLevel1.label',
        defaultMessage: 'Pack level 1',
        attributes: {
          formatValue: fieldValue => (_.get(fieldValue, 'parentContainer.name') || _.get(fieldValue, 'container.name') || 'Unpacked'),
        },
      },
      'container.name': {
        fieldKey: '',
        type: params => (!params.subfield ? <LabelField {...params} /> : null),
        label: 'react.partialReceiving.packLevel2.label',
        defaultMessage: 'Pack level 2',
        attributes: {
          formatValue: fieldValue => (_.get(fieldValue, 'parentContainer.name') ? _.get(fieldValue, 'container.name') || '' : ''),
        },
      },
      'product.productCode': {
        type: params => (params.subfield ? <LabelField {...params} /> : null),
        label: 'react.partialReceiving.code.label',
        defaultMessage: 'Code',
      },
      'product.name': {
        type: params => (params.subfield ? <LabelField {...params} /> : null),
        label: 'react.partialReceiving.product.label',
        defaultMessage: 'Product',
        headerAlign: 'left',
        attributes: {
          className: 'text-left',
          formatValue: value => (
            <span className="d-flex">
              <span className="text-truncate">
                {value}
              </span>
            </span>
          ),
        },
      },
      lotNumber: {
        type: params => (params.subfield ? <LabelField {...params} /> : null),
        label: 'react.partialReceiving.lotSerialNo.label',
        defaultMessage: 'Lot/Serial No.',
      },
      expirationDate: {
        type: params => (params.subfield ? <LabelField {...params} /> : null),
        label: 'react.partialReceiving.expirationDate.label',
        defaultMessage: 'Expiration date',
      },
      'binLocation.name': {
        type: params => (params.subfield ? <LabelField {...params} /> : null),
        label: 'react.partialReceiving.binLocation.label',
        defaultMessage: 'Bin Location',
        getDynamicAttr: ({ hasBinLocationSupport }) => ({
          hide: !hasBinLocationSupport,
        }),
      },
      'recipient.name': {
        type: params => (params.subfield ? <LabelField {...params} /> : null),
        label: 'react.partialReceiving.recipient.label',
        defaultMessage: 'Recipient',
        flexWidth: '1.5',
      },
      quantityReceiving: {
        type: params => (params.subfield ? <LabelField {...params} /> : null),
        label: 'react.partialReceiving.receivingNow.label',
        defaultMessage: 'Receiving now',
        attributes: {
          formatValue: value => (value ? (value.toLocaleString('en-US')) : value),
        },
      },
      quantityRemaining: {
        type: params => (params.subfield ? <LabelField {...params} /> : null),
        label: 'react.partialReceiving.remaining.label',
        defaultMessage: 'Remaining',
        fieldKey: '',
        attributes: {
          formatValue: fieldValue => (fieldValue && fieldValue.quantityRemaining ? fieldValue.quantityRemaining.toLocaleString('en-US') : fieldValue.quantityRemaining),
        },
        getDynamicAttr: ({ fieldValue }) => ({
          className: fieldValue && (fieldValue.cancelRemaining || !fieldValue.quantityRemaining) ? 'strike-through' : 'text-danger',
        }),
      },
      cancelRemaining: {
        fieldKey: 'quantityRemaining',
        type: params => (params.subfield ? <CheckboxField {...params} /> : null),
        label: 'react.partialReceiving.cancelRemaining.label',
        defaultMessage: 'Cancel remaining',
        getDynamicAttr: ({ saveDisabled, fieldValue, hasPartialReceivingSupport }) => ({
          disabled: saveDisabled || _.toInteger(fieldValue) <= 0 || !hasPartialReceivingSupport,
        }),
      },
      comment: {
        type: params => (params.subfield ? <LabelField {...params} /> : null),
        label: 'react.partialReceiving.comment.label',
        defaultMessage: 'Comment',
      },
    },
  },
};

function validate(values) {
  const errors = {};
  errors.containers = [];

  if (!values.dateDelivered) {
    errors.dateDelivered = 'react.default.error.requiredField.label';
  }
  _.forEach(values.containers, (container, key) => {
    errors.containers[key] = { shipmentItems: [] };
    _.forEach(container.shipmentItems, (item, key2) => {
      if (item.quantityReceiving < 0) {
        errors.containers[key].shipmentItems[key2] = { quantityReceiving: 'react.partialReceiving.error.quantityToReceiveNegative.label' };
      }
    });
  });

  return errors;
}

/**
 * The second page of partial receiving where user can view all changes made during the
 * receiving process. The user can cancel quantities not received and finalize the receipt.
 */
class ReceivingCheckScreen extends Component {
  static cancelRemaining(shipmentItem) {
    return {
      ...shipmentItem,
      cancelRemaining: shipmentItem.quantityRemaining > 0,
    };
  }
  constructor(props) {
    super(props);

    this.state = {
      completed: this.props.completed,
      values: { ...this.props.initialValues },
    };

    this.onSave = this.onSave.bind(this);
    this.cancelAllRemaining = this.cancelAllRemaining.bind(this);
  }

  onSave() {
    this.save(this.state.values);
  }

  onSubmit(formValues) {
    const isBinLocationChosen = !_.some(formValues.containers, container =>
      _.some(container.shipmentItems, shipmentItem => _.isNull(shipmentItem.binLocation.id)));

    if (!isBinLocationChosen && this.props.hasBinLocationSupport && !(formValues.shipmentStatus === 'RECEIVED')) {
      this.confirmReceive(formValues);
    } else {
      this.save({
        ...formValues,
        receiptStatus: 'COMPLETED',
      }, () => {
        this.setState({ completed: true });
        const { requisition, shipmentId } = formValues;
        window.location = `/openboxes/stockMovement/show/${requisition || shipmentId}`;
      });
    }
  }

  confirmReceive(formValues) {
    confirmAlert({
      title: this.props.translate('react.partialReceiving.message.confirmReceive.label', 'Confirm receiving'),
      message: this.props.translate(
        'react.partialReceiving.confirmReceive.message',
        'Are you sure you want to receive? There are some lines with empty bin locations.',
      ),
      buttons: [
        {
          label: this.props.translate('react.default.yes.label', 'Yes'),
          onClick: () => this.save({
            ...formValues,
            receiptStatus: 'COMPLETED',
          }, () => {
            this.setState({ completed: true });
            const { requisition, shipmentId } = formValues;
            window.location = `/openboxes/stockMovement/show/${requisition || shipmentId}`;
          }),
        },
        {
          label: this.props.translate('react.default.no.label', 'No'),
        },
      ],
    });
  }

  cancelAllRemaining() {
    const containers = update(this.state.values.containers, {
      $apply: items => (!items ? [] : items.map(item => update(item, {
        shipmentItems: {
          $apply: shipmentItems => (!shipmentItems ? [] : shipmentItems.map(shipmentItem =>
            this.cancelRemaining(shipmentItem))),
        },
      }))),
    });
    window.setFormValue('containers', containers);
  }

  saveAndExit(formValues) {
    this.saveValues(formValues)
      .then(() => {
        const { requisition, shipmentId } = formValues;

        window.location = `/openboxes/stockMovement/show/${requisition || shipmentId}`;
      })
      .catch(() => this.props.hideSpinner());
  }

  saveValues(formValues) {
    this.props.showSpinner();
    const url = `/openboxes/api/partialReceiving/${this.props.match.params.shipmentId}?stepNumber=2`;

    const payload = {
      ...formValues,
      containers: _.map(formValues.containers, container => ({
        ...container,
        shipmentItems: _.map(container.shipmentItems, (item) => {
          if (!_.get(item, 'recipient.id')) {
            return {
              ...item, recipient: '',
            };
          }

          return item;
        }),
      })),
    };

    return apiClient.post(url, flattenRequest(payload));
  }

  /**
   * Calls save method.
   * @public
   */
  save(formValues, callback) {
    this.props.showSpinner();

    this.saveValues(formValues)
      .then((response) => {
        this.props.hideSpinner();

        this.setState({ values: {} }, () =>
          this.setState({ values: parseResponse(response.data.data) }));
        if (callback) {
          callback();
        }
      })
      .catch(() => this.props.hideSpinner());
  }

  prevPage(values) {
    this.saveValues(values)
      .then(() => this.props.previousPage(values));
  }

  render() {
    return (
      <div>
        <Form
          onSubmit={values => this.onSubmit(values)}
          validate={validate}
          mutators={{
          ...arrayMutators,
          setValue: ([field, value], state, { changeValue }) => {
            changeValue(state, field, () => value);
          },
         }}
          initialValues={this.state.values}
          render={({ handleSubmit, values, form }) => {
          if (!window.setFormValue) {
            window.setFormValue = form.mutators.setValue;
          }
          return (
            <form onSubmit={handleSubmit}>
              <div className="classic-form classic-form-condensed">
                <span className="buttons-container classic-form-buttons">
                  <button
                    type="button"
                    className="btn btn-outline-secondary float-right btn-form btn-xs"
                    onClick={() => this.saveAndExit(this.state.values)}
                    disabled={this.state.completed || !_.size(this.state.values.containers)}
                  >
                    <span><i className="fa fa-sign-out pr-2" /><Translate id="react.default.button.saveAndExit.label" defaultMessage="Save and exit" /></span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary float-right btn-form btn-xs"
                    onClick={() => this.onSave()}
                    disabled={this.state.completed || !_.size(this.state.values.containers)}
                  ><Translate id="react.default.button.save.label" defaultMessage="Save" />
                  </button>
                  {this.state.values.hasPartialReceivingSupport ?
                    <button
                      type="button"
                      className="btn btn-outline-danger float-right btn-form btn-xs"
                      onClick={() => this.cancelAllRemaining()}
                      disabled={this.state.completed || !_.size(this.state.values.containers)}
                    ><Translate
                      id="react.partialReceiving.cancelAllRemaining.label"
                      defaultMessage="Cancel all remaining"
                    />
                    </button>
              : null}
                </span>
                <div className="form-title">Shipment Informations</div>
                {_.map(SHIPMENT_FIELDS, (fieldConfig, fieldName) =>
                renderFormField(fieldConfig, fieldName, {
                  saveDisabled: this.state.completed ||
                    !_.size(this.props.initialValues.containers),
                  hasBinLocationSupport: this.props.hasBinLocationSupport,
                  hasPartialReceivingSupport: this.props.hasPartialReceivingSupport,
                }))}
              </div>
              <div className="my-2 table-form">
                {_.map(TABLE_FIELDS, (fieldConfig, fieldName) =>
                renderFormField(fieldConfig, fieldName, {
                  saveDisabled: this.state.completed ||
                    !_.size(this.props.initialValues.containers),
                  hasBinLocationSupport: this.props.hasBinLocationSupport,
                  hasPartialReceivingSupport: this.props.hasPartialReceivingSupport,
                }))}
              </div>
              <div className="submit-buttons">
                <button type="button" className="btn btn-outline-primary btn-form btn-xs" onClick={() => this.prevPage(values)}>
                  <Translate id="react.partialReceiving.backToEdit.label" defaultMessage="Back to edit" />
                </button>
                <button
                  type="submit"
                  className="btn btn-outline-success btn-form float-right btn-xs"
                  disabled={this.state.completed || !_.size(this.state.values.containers)}
                ><Translate id="react.partialReceiving.receiveShipment.label" defaultMessage="Receive shipment" />
                </button>
              </div>
            </form>
          );
        }}
        />
      </div>
    );
  }
}

const mapStateToProps = state => ({
  hasBinLocationSupport: state.session.currentLocation.hasBinLocationSupport,
  hasPartialReceivingSupport: state.session.currentLocation.hasPartialReceivingSupport,
});

export default connect(mapStateToProps, {
  showSpinner, hideSpinner,
})(ReceivingCheckScreen);

ReceivingCheckScreen.propTypes = {
  /** All data in the form */
  initialValues: PropTypes.shape({
    containers: PropTypes.arrayOf(PropTypes.shape({})),
  }).isRequired,
  /** Indicator if partial receiving has been completed */
  completed: PropTypes.bool,
  /** Is true when currently selected location supports bins */
  hasBinLocationSupport: PropTypes.bool.isRequired,
  /** Function changing the value of a field in the Redux store */
  /** Is true when currently selected location supports partial receiving */
  hasPartialReceivingSupport: PropTypes.bool.isRequired,
  /** Function called when data is loading */
  showSpinner: PropTypes.func.isRequired,
  /** Function called when data has loaded */
  hideSpinner: PropTypes.func.isRequired,
  match: PropTypes.shape({
    params: PropTypes.shape({
      shipmentId: PropTypes.string,
    }),
  }).isRequired,
  translate: PropTypes.func.isRequired,
  previousPage: PropTypes.func.isRequired,
};

ReceivingCheckScreen.defaultProps = {
  completed: false,
  match: {},
};
